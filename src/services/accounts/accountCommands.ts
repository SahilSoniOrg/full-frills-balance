import Account from '@/src/data/models/Account';
import { AccountSubtype, AccountType, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { SerializedAccountMetadataPayload } from '@/src/types/plainDtos';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { getOpeningBalancesAccountInput } from '@/src/data/repositories/account/accountSystemAccountInputs';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import {
  journalPersistenceRepository,
  type JournalPersistenceResult,
} from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import {
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
  journalLegTypesForSignedAmount,
  resolveAccountSubtype,
  shouldPostInitialBalance,
} from '@/src/services/accounts/accountRules';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { workplaceService } from '@/src/services/WorkplaceService';
import { IconName } from '@/src/types/domainIcons';
import { isValidHexColor } from '@/src/utils/accountCategory';
import { roundToPrecision } from '@/src/utils/money';
import { effect } from '@/src/utils/accounting/BalanceEffects';

/** Caller-owned fields for creating an account (form / onboarding data only). */
export interface CreateAccountCommandInput {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string;
  icon?: IconName;
  /** Custom accent color (hex). Empty/omitted = derive from account type. */
  color?: string;
  initialBalance?: number;
  /** @deprecated Ordinary creation always appends within its sibling list. */
  orderNum?: number;
  parentAccountId?: AccountId | null;
  workplaceId: WorkplaceId;
  metadata?: Partial<SerializedAccountMetadataPayload>;
}

/** @deprecated Use CreateAccountCommandInput; kept for existing service typings. */
export type CreateAccountData = CreateAccountCommandInput;

export async function createAccount(
  workplaceId: WorkplaceId,
  input: CreateAccountCommandInput,
): Promise<Account> {
  let currencyCode = input.currencyCode;
  if (!currencyCode) {
    currencyCode = await workplaceService.getCurrency(workplaceId);
  }

  if (input.parentAccountId) {
    const [parent] = await assertWritable(workplaceId, [input.parentAccountId], 'Parent account');
    assertParentMatchesChildType(input.accountType, parent);
    const hasTransactions = await transactionQueryRepository.hasTransactions(
      workplaceId,
      input.parentAccountId,
    );
    if (hasTransactions) {
      assertParentHasNoTransactions(parent.name);
    }
  }

  if (input.metadata?.payFromAccountId) {
    await assertWritable(
      workplaceId,
      [input.metadata.payFromAccountId],
      'Account metadata pay-from',
    );
  }

  const precision = await currencyReadService.getPrecision(currencyCode);
  const postOpening = shouldPostInitialBalance(input.initialBalance, precision);
  const payload = {
    name: input.name,
    accountType: input.accountType,
    accountSubtype: resolveAccountSubtype(input.accountType, input.accountSubtype),
    currencyCode,
    description: input.description,
    icon: input.icon,
    color: input.color && isValidHexColor(input.color) ? input.color : undefined,
    orderNum: 0,
    parentAccountId: input.parentAccountId || undefined,
    workplaceId: input.workplaceId,
    metadata: input.metadata,
  };

  const journalDate = Date.now();
  const { account, openingJournal } = await runAccountingWriteSession(async session => {
    const created = await accountWriteRepository.createInSession(session, payload, {
      appendWithinSiblingList: true,
      audit: { initialBalance: input.initialBalance },
    });
    let openingJournal: JournalPersistenceResult | undefined;

    if (postOpening) {
      const openingInput = getOpeningBalancesAccountInput(currencyCode, input.workplaceId);
      const existingOpening = await accountQueryRepository.findByName(
        workplaceId,
        openingInput.name,
      );
      const balancingAccount =
        existingOpening ?? (await accountWriteRepository.createInSession(session, openingInput));
      const roundedAmount = roundToPrecision(Math.abs(input.initialBalance!), precision);
      const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
        input.accountType,
        input.initialBalance!,
      );
      const transactions = [
        {
          accountId: created.id,
          amount: roundedAmount,
          transactionType: accountTxType,
        },
        {
          accountId: balancingAccount.id,
          amount: roundedAmount,
          transactionType: balancingTxType,
        },
      ];
      const accountTypes = new Map([
        [created.id, created.accountType],
        [balancingAccount.id, balancingAccount.accountType],
      ]);
      const displayType = journalPresenter.getJournalDisplayType(transactions, accountTypes);
      const runningBalanceByAccountId = new Map<AccountId, number | null>();
      await Promise.all(
        transactions.map(async transaction => {
          const transactionAccount =
            transaction.accountId === created.id ? created : balancingAccount;
          const latest = await transactionQueryRepository.findLatestForAccountBeforeDate(
            workplaceId,
            transaction.accountId,
            journalDate,
          );
          const runningBalance = effect(
            transactionAccount.accountType,
            transaction.transactionType,
          ).apply(latest?.runningBalance ?? 0, transaction.amount, precision);
          runningBalanceByAccountId.set(transaction.accountId, runningBalance);
        }),
      );

      openingJournal = await journalPersistenceRepository.putInSession(
        session,
        {
          journalDate,
          description: `Initial Balance: ${input.name}`,
          currencyCode,
          status: JournalStatus.POSTED,
          displayType,
          transactions,
          runningBalanceByAccountId,
        },
        workplaceId,
      );
    }

    return { account: created, openingJournal };
  });

  if (openingJournal) {
    rebuildQueueService.enqueueMany(
      [...openingJournal.affectedAccountIds],
      openingJournal.rebuildFromDate,
      workplaceId,
    );
  }

  analytics.logAccountCreated(account.accountType, account.currencyCode);

  return account;
}
