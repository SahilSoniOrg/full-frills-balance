import { updateAccount } from '@/src/services/accounts/accountHierarchyCommands';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import {
  getOpeningBalancesAccountId,
  isSystemAccount,
} from '@/src/services/accounts/accountSystemAccounts';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { upsertPlannedPaymentByName } from '@/src/services/planned-payment/plannedPaymentCommands';
import { preferences } from '@/src/services/preferences';
import { clearSetupDraft, finishDeviceSetup, finishWorkplaceSetup } from '@/src/features/setup';
import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import dayjs from 'dayjs';
import type { CashClarityDraft, DraftAccount } from './draft';
import {
  budgetLookupName,
  incomeItemName,
  incomeSourceName,
  paymentCategoryName,
  paymentItemName,
  subtypeForAccount,
} from './draft';
import { mapDraftToWorkplaceOutput } from './mapToWorkplaceOutput';
import { clearPendingCashClarityWorkplaceId } from './pendingWorkplace';

type NamedAccount = Pick<
  AccountFields,
  'id' | 'name' | 'accountType' | 'accountSubtype' | 'currencyCode'
>;

function matchAccount(accounts: readonly NamedAccount[], draftAccount: DraftAccount) {
  const name = draftAccount.name.trim().toLowerCase();
  return accounts.find(account => account.name.trim().toLowerCase() === name);
}

function matchCategory(accounts: readonly NamedAccount[], name: string, type: AccountType) {
  const needle = name.trim().toLowerCase();
  return accounts.find(
    account => account.accountType === type && account.name.trim().toLowerCase() === needle,
  );
}

function requireNamed<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Could not save ${label}.`);
  return value;
}

function cardPaymentName(account: DraftAccount): string {
  return `Card payment · ${account.name}`;
}

export async function commitCashClarity(draft: CashClarityDraft): Promise<WorkplaceId> {
  const displayName = draft.displayName?.trim() ?? '';
  if (!displayName) throw new Error('Could not save your name.');
  const workplace = mapDraftToWorkplaceOutput(draft);
  const workplaceId = await finishWorkplaceSetup(draft.operationId, workplace);
  const accounts = (await accountQueries.findAll(workplaceId)).filter(
    account => !isSystemAccount(account),
  );

  for (const draftAccount of draft.accounts) {
    const account = requireNamed(matchAccount(accounts, draftAccount), draftAccount.name);
    const subtype = subtypeForAccount(draftAccount);
    if (account.accountSubtype !== subtype) {
      await updateAccount(workplaceId, account.id, { accountSubtype: subtype });
    }
    const openingId = await getOpeningBalancesAccountId(draft.currency, workplaceId);
    await adjustAccountBalance(workplaceId, account, draftAccount.balance, {
      kind: 'account',
      accountId: openingId,
    });
  }

  const needsPayFrom =
    (draft.income.kind === 'recurring' && draft.income.items.length > 0) ||
    (draft.commitment.kind === 'payment' && draft.commitment.items.length > 0) ||
    (draft.budget.kind === 'set' && draft.budget.items.length > 0) ||
    draft.accounts.some(account => account.cardPaymentAmount);

  const payFrom = draft.accounts.find(
    account => account.kind !== 'card' && account.spendable !== false,
  );
  const payFromId = payFrom ? matchAccount(accounts, payFrom)?.id : undefined;
  if (needsPayFrom) {
    requireNamed(payFromId, 'a spendable account for planned money');
  }

  if (draft.income.kind === 'recurring' && payFromId) {
    for (const item of draft.income.items) {
      const incomeName = incomeItemName(item);
      const incomeAccount = requireNamed(
        matchCategory(accounts, incomeSourceName(item.source), AccountType.INCOME),
        incomeSourceName(item.source),
      );
      await upsertPlannedPaymentByName(workplaceId, {
        name: incomeName,
        amount: item.amount,
        currencyCode: draft.currency,
        fromAccountId: incomeAccount.id,
        toAccountId: payFromId,
        intervalN: item.intervalN,
        intervalType: item.interval,
        startDate: item.nextDate,
        isAutoPost: false,
        recurrenceDay: dayjs(item.nextDate).date(),
      });
    }
  }

  if (draft.commitment.kind === 'payment' && payFromId) {
    for (const item of draft.commitment.items) {
      const expense = requireNamed(
        matchCategory(accounts, paymentCategoryName(item.type), AccountType.EXPENSE),
        paymentItemName(item),
      );
      await upsertPlannedPaymentByName(workplaceId, {
        name: paymentItemName(item),
        amount: item.amount,
        currencyCode: draft.currency,
        fromAccountId: payFromId,
        toAccountId: expense.id,
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        startDate: item.dueDate,
        isAutoPost: false,
        recurrenceDay: dayjs(item.dueDate).date(),
      });
    }
  }

  for (const draftAccount of draft.accounts) {
    if (!draftAccount.cardPaymentAmount || !draftAccount.cardPaymentDate || !payFromId) continue;
    const card = requireNamed(matchAccount(accounts, draftAccount), draftAccount.name);
    await upsertPlannedPaymentByName(workplaceId, {
      name: cardPaymentName(draftAccount),
      amount: draftAccount.cardPaymentAmount,
      currencyCode: draft.currency,
      fromAccountId: payFromId,
      toAccountId: card.id,
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      startDate: draftAccount.cardPaymentDate,
      isAutoPost: false,
      recurrenceDay: dayjs(draftAccount.cardPaymentDate).date(),
    });
  }

  if (draft.budget.kind === 'set' && payFromId) {
    for (const item of draft.budget.items) {
      const category = requireNamed(
        matchCategory(accounts, budgetLookupName(item), AccountType.EXPENSE),
        item.name,
      );
      await budgetWriteService.upsertByName(
        workplaceId,
        {
          name: item.name,
          amount: item.amount,
          currencyCode: draft.currency,
          startMonth: dayjs().format('YYYY-MM'),
          intervalType: PlannedPaymentInterval.MONTHLY,
          intervalN: 1,
          startDate: dayjs().startOf('month').valueOf(),
          recurrenceDay: 1,
          assetAccountIds: [payFromId],
        },
        [category.id],
      );
    }
  }

  finishDeviceSetup({
    displayName: { value: displayName, source: 'user_entered' },
  });
  preferences.device.setActiveWorkplaceId(workplaceId);
  clearPendingCashClarityWorkplaceId();
  clearSetupDraft();
  return workplaceId;
}
