import { currencyReadService } from '@/src/services/currency-read-service';
import {
  CashClarityPublicationError,
  cashClarityStableItemId,
  type CashClarityBudgetPlan,
  type CashClarityOpeningBalance,
  type CashClarityPlannedPaymentPlan,
  type CashClarityPublicationAccount,
  type CashClarityPublicationOutcome,
  type CashClarityPublicationPlan,
} from '@/src/services/setup/cashClarityPublicationTypes';
import {
  publishCashClarityBooks,
  recoverCashClarityBooks,
} from '@/src/services/setup/cashClarityPublicationService';
import { buildOnboardingIncomeRecurrence } from './incomeRecurrence';
import { PlannedPaymentInterval } from '@/src/types/enums';
import {
  asBudgetId,
  asJournalId,
  asPlannedPaymentId,
  type AccountId,
  type WorkplaceId,
} from '@/src/types/ids';
import dayjs from 'dayjs';
import type { CashClarityDraft } from './draft';
import {
  invalid,
  snapshotCashClarityDraft,
  validateCashClarityCurrencyPrecision,
  validateCashClarityDraft,
} from './cashClarityPublicationValidation';
import {
  ACCOUNT_KIND_META,
  budgetLookupName,
  incomeItemName,
  incomeSourceName,
  isSpendableAccount,
  paymentCategoryName,
  paymentItemName,
  subtypeForAccount,
} from './draft';
import {
  mapDraftToWorkplaceOutput,
  publishedDraftAccountId,
  starterCategoryId,
} from './mapToWorkplaceOutput';

export { CashClarityPublicationError };
export type {
  CashClarityPublicationErrorCode,
  CashClarityPublicationOutcome,
} from '@/src/services/setup/cashClarityPublicationTypes';

function accountInputs(draft: CashClarityDraft) {
  const output = mapDraftToWorkplaceOutput(draft);
  const draftPublicationIds = new Set<string>();
  for (const candidate of draft.accounts) {
    const id = publishedDraftAccountId(draft, candidate);
    if (draftPublicationIds.has(id))
      invalid('Account definitions must have unique stable identities.');
    draftPublicationIds.add(id);
  }
  const accounts = output.selectedAccounts.map(account => {
    if (typeof account.id !== 'string' || !account.id.trim()) {
      invalid('Every published account must have a stable ID.');
    }
    const draftAccount = draft.accounts.find(
      candidate => publishedDraftAccountId(draft, candidate) === account.id,
    );
    return {
      id: account.id,
      name: account.name,
      accountType: account.type,
      ...(draftAccount ? { accountSubtype: subtypeForAccount(draftAccount) } : {}),
      currencyCode: draft.currency,
      icon: account.icon,
    };
  });
  const categories = output.selectedCategories.map(category => ({
    id: category.id ?? starterCategoryId(draft.operationId, category.name),
    name: category.name,
    accountType: category.type,
    currencyCode: draft.currency,
    icon: category.icon,
  }));
  const names = new Set<string>();
  const accountIds = new Set<string>();
  for (const item of [...accounts, ...categories]) {
    if (accountIds.has(item.id)) invalid('Account and category IDs must be unique.');
    accountIds.add(item.id);
    const key = item.name.trim().toLowerCase();
    if (!key || names.has(key)) invalid('Account and category names must be unique.');
    names.add(key);
  }
  const categoryIdsByName = new Map<string, string>();
  for (const category of categories) {
    const key = category.name.trim().toLowerCase();
    const existing = categoryIdsByName.get(key);
    if (existing && existing !== category.id) invalid('Category names must be unique.');
    categoryIdsByName.set(key, category.id);
  }
  const referencedCategoryNames = [
    ...(draft.income.kind === 'recurring'
      ? draft.income.items.map(item => incomeSourceName(item.source))
      : []),
    ...(draft.commitment.kind === 'payment'
      ? draft.commitment.items.map(item => paymentCategoryName(item.type))
      : []),
    ...(draft.budget.kind === 'set'
      ? draft.budget.items.map(item => budgetLookupName(item, draft.preservedStarterCategories))
      : []),
  ];
  if (referencedCategoryNames.some(name => !categoryIdsByName.has(name.trim().toLowerCase()))) {
    invalid('A planned item refers to a missing category.');
  }
  const categoryIdForName = (name: string): AccountId => {
    const id = categoryIdsByName.get(name.trim().toLowerCase());
    if (!id) invalid('A planned item refers to a missing category.');
    return id as AccountId;
  };
  return {
    output,
    accounts: [...accounts, ...categories] as readonly CashClarityPublicationAccount[],
    categoryIdForName,
  };
}

function openingBalances(draft: CashClarityDraft): CashClarityOpeningBalance[] {
  return draft.accounts.flatMap(account => {
    if (account.balance === 0) return [];
    return [
      {
        journalId: asJournalId(cashClarityStableItemId('journal', draft.operationId, account.id)),
        accountId: publishedDraftAccountId(draft, account),
        accountType: ACCOUNT_KIND_META[account.kind].type,
        signedAmount: account.balance,
        description: `Opening balance · ${account.name.trim() || ACCOUNT_KIND_META[account.kind].name}`,
      },
    ];
  });
}

function plannedPaymentId(draft: CashClarityDraft, itemId: string) {
  return asPlannedPaymentId(
    cashClarityStableItemId('planned-payment', draft.operationId, itemId),
  );
}

function plannedPayments(
  draft: CashClarityDraft,
  payFromId: AccountId | undefined,
  categoryIdForName: (name: string) => AccountId,
): CashClarityPlannedPaymentPlan[] {
  if (!payFromId) return [];
  const payments: CashClarityPlannedPaymentPlan[] = [];
  if (draft.income.kind === 'recurring') {
    for (const item of draft.income.items) {
      const recurrence = buildOnboardingIncomeRecurrence(item);
      payments.push({
        id: plannedPaymentId(draft, `income:${item.id}`),
        input: {
          name: incomeItemName(item),
          amount: item.amount,
          currencyCode: draft.currency,
          fromAccountId: categoryIdForName(incomeSourceName(item.source)),
          toAccountId: payFromId,
          intervalN: recurrence.intervalN,
          intervalType: recurrence.intervalType,
          startDate: recurrence.firstOccurrence,
          isAutoPost: false,
          recurrenceDay: recurrence.recurrenceDay,
          recurrenceMonth: recurrence.recurrenceMonth,
        },
      });
    }
  }
  if (draft.commitment.kind === 'payment') {
    for (const item of draft.commitment.items) {
      payments.push({
        id: plannedPaymentId(draft, `payment:${item.id}`),
        input: {
          name: paymentItemName(item),
          amount: item.amount,
          currencyCode: draft.currency,
          fromAccountId: payFromId,
          toAccountId: categoryIdForName(paymentCategoryName(item.type)),
          intervalN: 1,
          intervalType: PlannedPaymentInterval.MONTHLY,
          startDate: dayjs(item.dueDate).startOf('day').valueOf(),
          isAutoPost: false,
          recurrenceDay: dayjs(item.dueDate).date(),
        },
      });
    }
  }
  for (const account of draft.accounts) {
    if (account.kind !== 'card' || account.cardPaymentAmount === undefined) continue;
    payments.push({
      id: plannedPaymentId(draft, `card-payment:${account.id}`),
      input: {
        name: `Card payment · ${account.name.trim() || ACCOUNT_KIND_META.card.name}`,
        amount: account.cardPaymentAmount,
        currencyCode: draft.currency,
        fromAccountId: payFromId,
        toAccountId: publishedDraftAccountId(draft, account),
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        startDate: dayjs(account.cardPaymentDate).startOf('day').valueOf(),
        isAutoPost: false,
        recurrenceDay: dayjs(account.cardPaymentDate).date(),
      },
    });
  }
  return payments;
}

function budgets(
  draft: CashClarityDraft,
  payFromId: AccountId | undefined,
  categoryIdForName: (name: string) => AccountId,
): CashClarityBudgetPlan[] {
  if (!payFromId || draft.budget.kind !== 'set') return [];
  return draft.budget.items.map(item => ({
    id: asBudgetId(cashClarityStableItemId('budget', draft.operationId, item.id)),
    name: item.name.trim(),
    amount: item.amount,
    assetAccountId: payFromId,
    categoryAccountIds: [
      categoryIdForName(budgetLookupName(item, draft.preservedStarterCategories)),
    ],
  }));
}

/** Publishes all Cash Clarity books and its completion receipt in one database transaction. */
export async function publishCashClarity(
  draft: CashClarityDraft,
  options: { readonly preserveWorkplaceName?: boolean } = {},
): Promise<CashClarityPublicationOutcome> {
  validateCashClarityDraft(draft);
  const submitted = snapshotCashClarityDraft(draft);
  let precision: number;
  try {
    precision = await currencyReadService.getPrecision(submitted.currency);
  } catch {
    invalid('Choose a supported currency.');
  }
  validateCashClarityCurrencyPrecision(submitted, precision);
  const { output, accounts, categoryIdForName } = accountInputs(submitted);

  const needsSpendableAccount =
    (submitted.income.kind === 'recurring' && submitted.income.items.length > 0) ||
    (submitted.commitment.kind === 'payment' && submitted.commitment.items.length > 0) ||
    (submitted.budget.kind === 'set' && submitted.budget.items.length > 0) ||
    submitted.accounts.some(
      account => account.kind === 'card' && account.cardPaymentAmount !== undefined,
    );
  const spendable = submitted.accounts.find(isSpendableAccount);
  if (needsSpendableAccount && !spendable) {
    throw new CashClarityPublicationError(
      'missing_spendable_account',
      'Add a spendable account before saving planned money.',
    );
  }
  const payFromId = spendable ? publishedDraftAccountId(submitted, spendable) : undefined;

  const plan: CashClarityPublicationPlan = {
    operationId: submitted.operationId,
    workplace: {
      name: output.name.value,
      nameIsDefault: output.name.source === 'defaulted',
      icon: output.icon.value,
      defaultCurrencyCode: submitted.currency,
      accounts,
    },
    openingBalances: openingBalances(submitted),
    plannedPayments: plannedPayments(submitted, payFromId, categoryIdForName),
    budgets: budgets(submitted, payFromId, categoryIdForName),
    ...(options.preserveWorkplaceName === undefined
      ? {}
      : { preserveWorkplaceName: options.preserveWorkplaceName }),
  };

  return publishCashClarityBooks(plan);
}

/** Verify saved books and replay derived effects without accepting another creation payload. */
export function recoverCashClarityPublication(
  workplaceId: WorkplaceId,
): Promise<CashClarityPublicationOutcome> {
  return recoverCashClarityBooks(workplaceId);
}
