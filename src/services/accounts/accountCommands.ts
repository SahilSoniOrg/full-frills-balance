import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { CreateAccountCommandInput } from '@/src/services/accounts/accountCommandInputs';
import { assertAccountsExistInWorkplace } from '@/src/services/accounts/assertAccountsExist';
import {
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
  journalLegTypesForSignedAmount,
  resolveAccountSubtype,
  shouldPostInitialBalance,
} from '@/src/services/accounts/accountRules';
import { getOpeningBalancesAccountId } from '@/src/services/accounts/accountSystemAccounts';
import { ledgerWriteService } from '@/src/services/ledger/ledgerWriteService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { roundToPrecision } from '@/src/utils/money';

export async function createAccount(
  workplaceId: WorkplaceId,
  input: CreateAccountCommandInput,
): Promise<Account> {
  const orderNum = input.orderNum ?? (await accountRepository.countNonDeleted(workplaceId));

  let currencyCode = input.currencyCode;
  if (!currencyCode) {
    currencyCode = await workplaceService.getCurrency(workplaceId);
  }

  if (input.parentAccountId) {
    const parent = await accountRepository.find(workplaceId, input.parentAccountId);
    if (!parent) throw new Error('Parent account not found');
    assertParentMatchesChildType(input.accountType, parent);
    const hasTransactions = await transactionRepository.hasTransactions(
      workplaceId,
      input.parentAccountId,
    );
    if (hasTransactions) {
      assertParentHasNoTransactions(parent.name);
    }
  }

  if (input.metadata?.payFromAccountId) {
    await assertAccountsExistInWorkplace(
      workplaceId,
      [input.metadata.payFromAccountId],
      'Account metadata pay-from',
    );
  }

  const account = await accountRepository.create({
    name: input.name,
    accountType: input.accountType,
    accountSubtype: resolveAccountSubtype(input.accountType, input.accountSubtype),
    currencyCode,
    description: input.description,
    icon: input.icon,
    orderNum,
    parentAccountId: input.parentAccountId || undefined,
    workplaceId: input.workplaceId,
    metadata: input.metadata,
  });

  const precision = await currencyReadService.getPrecision(currencyCode);
  await auditService.log(
    {
      entityType: 'account',
      entityId: account.id,
      action: AuditAction.CREATE,
      changes: {
        after: {
          name: account.name,
          accountType: account.accountType,
          accountSubtype: account.accountSubtype,
          currencyCode: account.currencyCode,
          description: account.description,
          icon: account.icon,
          orderNum: account.orderNum,
          parentAccountId: account.parentAccountId,
          initialBalance: input.initialBalance,
        },
      },
    },
    workplaceId,
  );

  analytics.logAccountCreated(account.accountType, account.currencyCode);

  if (shouldPostInitialBalance(input.initialBalance, precision)) {
    const roundedAmount = roundToPrecision(Math.abs(input.initialBalance!), precision);
    const balancingAccountId = await getOpeningBalancesAccountId(currencyCode, input.workplaceId);
    const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
      input.accountType,
      input.initialBalance!,
    );

    await ledgerWriteService.createJournal(
      {
        journalDate: Date.now(),
        description: `Initial Balance: ${input.name}`,
        currencyCode,
        transactions: [
          {
            accountId: account.id as AccountId,
            amount: roundedAmount,
            transactionType: accountTxType,
          },
          {
            accountId: balancingAccountId as AccountId,
            amount: roundedAmount,
            transactionType: balancingTxType,
          },
        ],
      },
      input.workplaceId,
    );
  }

  return account;
}
