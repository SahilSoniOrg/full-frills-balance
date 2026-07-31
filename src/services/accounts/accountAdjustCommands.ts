import Account from '@/src/data/models/Account';
import { currencyReadService } from '@/src/services/currency-read-service';
import { balanceService } from '@/src/services/BalanceService';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import {
  isBalanceAdjustmentNeeded,
  journalLegTypesForSignedAmount,
} from '@/src/services/accounts/accountRules';
import { findOrCreateBalanceCorrectionAccount } from '@/src/services/accounts/accountSystemAccounts';
import { ledgerWriteService } from '@/src/services/ledger/ledgerWriteService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';

/**
 * Balance-adjustment command: posts a two-leg journal so the account reaches
 * the target balance. Default counterparty is the equity Balance Corrections
 * account; callers may pass an explicit income/expense/asset/liability leg.
 */
export async function adjustAccountBalance(
  workplaceId: WorkplaceId,
  account: Account,
  targetBalance: number,
  counterparty: BalanceChangeCounterparty = { kind: 'adjustment' },
): Promise<void> {
  const precision = await currencyReadService.getPrecision(account.currencyCode);
  const currentBalanceData = await balanceService.getAccountBalance(account.id, workplaceId);
  const currentBalance = currentBalanceData.balance;

  const discrepancy = roundToPrecision(targetBalance - currentBalance, precision);
  if (!isBalanceAdjustmentNeeded(discrepancy, precision)) {
    logger.info(
      `[AccountAdjustCommand] No adjustment needed for account ${account.name}. Discrepancy within epsilon.`,
    );
    return;
  }

  logger.info(
    `[AccountAdjustCommand] Adjusting balance for ${account.name}: ${currentBalance} -> ${targetBalance} (diff: ${discrepancy}, counterparty: ${counterparty.kind})`,
  );

  const balancingAccountId =
    counterparty.kind === 'account'
      ? counterparty.accountId
      : await findOrCreateBalanceCorrectionAccount(account.currencyCode, workplaceId);

  if (balancingAccountId === (account.id as AccountId)) {
    throw new Error('Balance change counterparty cannot be the same account');
  }

  const amount = Math.abs(discrepancy);
  const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
    account.accountType,
    discrepancy,
  );

  const description =
    counterparty.kind === 'adjustment'
      ? `Balance Adjustment: ${account.name}`
      : `Balance update: ${account.name}`;

  await ledgerWriteService.createJournal(
    {
      journalDate: Date.now(),
      description,
      currencyCode: account.currencyCode,
      transactions: [
        {
          accountId: account.id as AccountId,
          amount: amount,
          transactionType: accountTxType,
        },
        {
          accountId: balancingAccountId,
          amount: amount,
          transactionType: balancingTxType,
        },
      ],
    },
    workplaceId,
  );
}
