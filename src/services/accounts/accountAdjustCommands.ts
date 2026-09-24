import { accountQueryRepository } from '@/src/data/repositories/account';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { findOrCreateBalanceCorrectionAccountInSession } from '@/src/services/accounts/accountSystemAccounts';
import type { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import {
  journalLegTypesForSignedAmount,
  isBalanceAdjustmentNeeded,
} from '@/src/services/accounts/accountRules';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { JournalStatus } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';

/**
 * Set an account's balance by posting the required two-leg journal. The account,
 * current ledger value, correction account, and journal are resolved in one writer.
 */
export async function adjustAccountBalance(
  workplaceId: WorkplaceId,
  account: { id: AccountId },
  targetBalance: number,
  counterparty: BalanceChangeCounterparty = { kind: 'adjustment' },
): Promise<void> {
  const outcome = await runAccountingWriteSession(async session => {
    const targetAccount = await accountQueryRepository.find(workplaceId, account.id);
    if (!targetAccount) {
      throw new Error(`Account ${account.id} not found or deleted`);
    }

    const precision = await currencyReadService.getPrecision(targetAccount.currencyCode);
    const currentBalance = roundToPrecision(
      await transactionRawRepository.getAccountSumRaw(
        workplaceId,
        targetAccount.id,
        Number.MAX_SAFE_INTEGER,
        targetAccount.accountType,
      ),
      precision,
    );
    const discrepancy = roundToPrecision(targetBalance - currentBalance, precision);

    if (!isBalanceAdjustmentNeeded(discrepancy, precision)) {
      return { targetAccount, currentBalance, discrepancy, journal: undefined };
    }

    const balancingAccount =
      counterparty.kind === 'adjustment'
        ? await findOrCreateBalanceCorrectionAccountInSession(
            session,
            targetAccount.currencyCode,
            workplaceId,
          )
        : await accountQueryRepository.find(workplaceId, counterparty.accountId);
    if (!balancingAccount) {
      const counterpartyId = counterparty.kind === 'account' ? counterparty.accountId : '';
      throw new Error(`Balance change counterparty ${counterpartyId} not found or deleted`);
    }
    if (balancingAccount.id === targetAccount.id) {
      throw new Error('Balance change counterparty cannot be the same account');
    }

    const amount = Math.abs(discrepancy);
    const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
      targetAccount.accountType,
      discrepancy,
    );
    const journal = await journalPersistenceService.putInSession(
      session,
      {
        journalDate: Date.now(),
        description:
          counterparty.kind === 'adjustment'
            ? `Balance Adjustment: ${targetAccount.name}`
            : `Balance update: ${targetAccount.name}`,
        currencyCode: targetAccount.currencyCode,
        status: JournalStatus.POSTED,
        transactions: [
          { accountId: targetAccount.id, amount, transactionType: accountTxType },
          { accountId: balancingAccount.id, amount, transactionType: balancingTxType },
        ],
      },
      workplaceId,
    );

    return { targetAccount, currentBalance, discrepancy, journal };
  });

  if (!outcome.journal) {
    logger.info(
      `[AccountAdjustCommand] No adjustment needed for account ${outcome.targetAccount.name}. Discrepancy within epsilon.`,
    );
    return;
  }

  logger.info(
    `[AccountAdjustCommand] Adjusting balance for ${outcome.targetAccount.name}: ${outcome.currentBalance} -> ${targetBalance} (diff: ${outcome.discrepancy}, counterparty: ${counterparty.kind})`,
  );
  journalPersistenceService.afterAtomicWriteCommit([outcome.journal], workplaceId);
}
