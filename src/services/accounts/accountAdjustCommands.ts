import Account from '@/src/data/models/Account';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { balanceService } from '@/src/services/BalanceService';
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
 * Balance-adjustment command: posts a correction journal so the account reaches
 * the target balance. Owns discrepancy calculation and correction-account policy.
 */
export async function adjustAccountBalance(
  workplaceId: WorkplaceId,
  account: Account,
  targetBalance: number,
): Promise<void> {
  const precision = await currencyRepository.getPrecision(account.currencyCode);
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
    `[AccountAdjustCommand] Adjusting balance for ${account.name}: ${currentBalance} -> ${targetBalance} (diff: ${discrepancy})`,
  );

  const correctionAccountId = await findOrCreateBalanceCorrectionAccount(
    account.currencyCode,
    workplaceId,
  );

  const amount = Math.abs(discrepancy);
  const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
    account.accountType,
    discrepancy,
  );

  await ledgerWriteService.createJournal(
    {
      journalDate: Date.now(),
      description: `Balance Adjustment: ${account.name}`,
      currencyCode: account.currencyCode,
      transactions: [
        {
          accountId: account.id as AccountId,
          amount: amount,
          transactionType: accountTxType as any,
        },
        {
          accountId: correctionAccountId,
          amount: amount,
          transactionType: balancingTxType as any,
        },
      ],
    },
    workplaceId,
  );
}
