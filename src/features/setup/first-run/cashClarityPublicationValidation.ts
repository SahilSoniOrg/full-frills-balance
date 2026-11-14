import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import dayjs from 'dayjs';
import { roundToPrecision } from '@/src/utils/money';
import {
  isSpendableAccount,
  type CashClarityDraft,
  type CommitmentDraft,
  type CommitmentKind,
  type IncomeDraft,
} from './draft';
import { CashClarityPublicationError } from './cashClarityPublicationTypes';

export function invalid(message: string): never {
  throw new CashClarityPublicationError('invalid_input', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFiniteMoney(value: unknown, label: string, allowZero: boolean): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowZero ? false : value <= 0)
  ) {
    invalid(`${label} must be a finite ${allowZero ? 'amount' : 'positive amount'}.`);
  }
}

function assertName(value: unknown, label: string, optional = false): asserts value is string {
  if (typeof value !== 'string' || (!optional && !value.trim())) {
    invalid(`${label} is required.`);
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !dayjs(value).isValid()
  ) {
    invalid(`${label} must be a valid date.`);
  }
}

function validatePreservedDefinitions(
  items: CashClarityDraft['preservedStarterAccounts'],
  label: string,
): void {
  if (items === undefined) return;
  if (!Array.isArray(items)) invalid(`${label} setup is malformed.`);
  const byId = new Map<string, { name: string; type: AccountType; icon: string }>();
  const names = new Set<string>();
  for (const item of items) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      !Object.values(AccountType).includes(item.type as AccountType) ||
      typeof item.icon !== 'string' ||
      !Object.values(Icon).some(icon => icon === item.icon)
    ) {
      invalid(`${label} contains an invalid preserved definition.`);
    }
    const existing = byId.get(item.id);
    if (
      existing &&
      (existing.name !== item.name || existing.type !== item.type || existing.icon !== item.icon)
    ) {
      invalid(`${label} contains conflicting definitions with the same ID.`);
    }
    byId.set(item.id, { name: item.name, type: item.type as AccountType, icon: item.icon });
    const name = item.name.trim().toLowerCase();
    if (!existing && names.has(name)) invalid(`${label} names must be unique.`);
    names.add(name);
  }
}

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const candidate of items as readonly unknown[]) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      !candidate.id.trim() ||
      ids.has(candidate.id)
    ) {
      invalid(`${label} must have unique, non-empty item IDs.`);
    }
    ids.add(candidate.id);
  }
}

function validateIncome(draft: CashClarityDraft): void {
  const income = draft.income as IncomeDraft;
  if (!isRecord(income) || !['unset', 'skipped', 'recurring'].includes(String(income.kind))) {
    invalid('Income setup is malformed.');
  }
  if (income.kind !== 'recurring') return;
  if (!Array.isArray(income.items)) invalid('Income setup is malformed.');
  assertUniqueIds(income.items, 'Income');
  const sources = new Set(['salary', 'family', 'retirement', 'freelance', 'other']);
  for (const item of income.items) {
    if (!isRecord(item) || !sources.has(String(item.source))) invalid('An income source is invalid.');
    assertName(item.name, 'Income name', true);
    assertFiniteMoney(item.amount, 'Income amount', false);
    assertTimestamp(item.nextDate, 'Income date');
    if (
      !Object.values(PlannedPaymentInterval).includes(item.interval as PlannedPaymentInterval) ||
      !Number.isInteger(item.intervalN) ||
      item.intervalN < 1 ||
      item.intervalN > 9999
    ) {
      invalid('Income recurrence is invalid.');
    }
  }
}

function validateCommitments(draft: CashClarityDraft): void {
  const commitment = draft.commitment as CommitmentDraft;
  if (
    !isRecord(commitment) ||
    !['unset', 'skipped', 'payment'].includes(String(commitment.kind))
  ) {
    invalid('Payment setup is malformed.');
  }
  if (commitment.kind !== 'payment') return;
  if (!Array.isArray(commitment.items)) invalid('Payment setup is malformed.');
  assertUniqueIds(commitment.items, 'Payment');
  const types = new Set<CommitmentKind>(['rent', 'subscription', 'loan', 'utilities']);
  for (const item of commitment.items) {
    if (!isRecord(item) || !types.has(item.type as CommitmentKind)) invalid('A payment type is invalid.');
    assertName(item.name, 'Payment name', true);
    assertFiniteMoney(item.amount, 'Payment amount', false);
    assertTimestamp(item.dueDate, 'Payment due date');
  }
}

function validateBudgets(draft: CashClarityDraft): void {
  const budget = draft.budget;
  if (!isRecord(budget) || !['unset', 'skipped', 'set'].includes(String(budget.kind))) {
    invalid('Budget setup is malformed.');
  }
  if (budget.kind !== 'set') return;
  if (!Array.isArray(budget.items)) invalid('Budget setup is malformed.');
  assertUniqueIds(budget.items, 'Budget');
  for (const item of budget.items) {
    if (!isRecord(item)) invalid('A budget is malformed.');
    assertName(item.name, 'Budget name');
    if (item.category !== undefined) assertName(item.category, 'Budget category');
    assertFiniteMoney(item.amount, 'Budget amount', false);
  }
}

export function validateCashClarityDraft(draft: CashClarityDraft): void {
  if (!isRecord(draft)) invalid('Setup details are malformed.');
  assertName(draft.operationId, 'Setup operation ID');
  assertName(draft.workplaceName, 'Workplace name');
  assertName(draft.workplaceIcon, 'Workplace icon');
  assertName(draft.displayName, 'Device name', true);
  if (typeof draft.currency !== 'string' || !/^[A-Z]{3}$/.test(draft.currency)) {
    invalid('Choose a supported currency.');
  }
  if (!Array.isArray(draft.accounts)) invalid('Account setup is malformed.');
  validatePreservedDefinitions(draft.preservedStarterAccounts, 'Preserved accounts');
  validatePreservedDefinitions(draft.preservedStarterCategories, 'Preserved categories');
  assertUniqueIds(draft.accounts, 'Account');
  const kinds = new Set(['bank', 'cash', 'savings', 'card']);
  for (const account of draft.accounts) {
    if (!isRecord(account) || !kinds.has(String(account.kind))) invalid('An account type is invalid.');
    assertName(account.name, 'Account name', true);
    assertFiniteMoney(account.balance, 'Account balance', true);
    if (account.kind === 'card' && account.balance < 0) invalid('Card debt cannot be negative.');
    if (
      account.kind === 'savings' &&
      account.spendable !== true &&
      account.spendable !== false
    ) {
      invalid('Choose whether the savings account is available to spend.');
    }
    if (account.kind !== 'savings' && account.spendable !== undefined) {
      invalid('Spendable status is only valid for savings accounts.');
    }
    if (
      account.kind !== 'card' &&
      (account.cardPaymentAmount !== undefined || account.cardPaymentDate !== undefined)
    ) {
      invalid('Card payment details require a credit card.');
    }
    if (account.kind === 'card') {
      if (account.cardPaymentAmount !== undefined) {
        assertFiniteMoney(account.cardPaymentAmount, 'Card payment amount', false);
        assertTimestamp(account.cardPaymentDate, 'Card payment date');
      } else if (account.cardPaymentDate !== undefined) {
        invalid('Card payment amount is missing.');
      }
    }
  }
  validateIncome(draft);
  validateCommitments(draft);
  validateBudgets(draft);

  const needsSpendableAccount =
    (draft.income.kind === 'recurring' && draft.income.items.length > 0) ||
    (draft.commitment.kind === 'payment' && draft.commitment.items.length > 0) ||
    (draft.budget.kind === 'set' && draft.budget.items.length > 0) ||
    draft.accounts.some(account => account.kind === 'card' && account.cardPaymentAmount !== undefined);
  if (needsSpendableAccount && !draft.accounts.some(isSpendableAccount)) {
    throw new CashClarityPublicationError(
      'missing_spendable_account',
      'Add a spendable account before saving planned money.',
    );
  }
}

export function snapshotCashClarityDraft(draft: CashClarityDraft): CashClarityDraft {
  const income =
    draft.income.kind === 'recurring'
      ? { ...draft.income, items: draft.income.items.map(item => ({ ...item })) }
      : { ...draft.income };
  const commitment =
    draft.commitment.kind === 'payment'
      ? { ...draft.commitment, items: draft.commitment.items.map(item => ({ ...item })) }
      : { ...draft.commitment };
  const budget =
    draft.budget.kind === 'set'
      ? { ...draft.budget, items: draft.budget.items.map(item => ({ ...item })) }
      : { ...draft.budget };
  const result: CashClarityDraft = {
    ...draft,
    accounts: draft.accounts.map(account => ({ ...account })),
    preservedStarterAccounts: draft.preservedStarterAccounts?.map(item => ({ ...item })),
    preservedStarterCategories: draft.preservedStarterCategories?.map(item => ({ ...item })),
    income,
    commitment,
    budget,
  };
  result.accounts.forEach(account => Object.freeze(account));
  Object.freeze(result.accounts);
  result.preservedStarterAccounts?.forEach(Object.freeze);
  if (result.preservedStarterAccounts) Object.freeze(result.preservedStarterAccounts);
  result.preservedStarterCategories?.forEach(Object.freeze);
  if (result.preservedStarterCategories) Object.freeze(result.preservedStarterCategories);
  if (result.income.kind === 'recurring') {
    result.income.items.forEach(Object.freeze);
    Object.freeze(result.income.items);
  }
  if (result.commitment.kind === 'payment') {
    result.commitment.items.forEach(Object.freeze);
    Object.freeze(result.commitment.items);
  }
  if (result.budget.kind === 'set') {
    result.budget.items.forEach(Object.freeze);
    Object.freeze(result.budget.items);
  }
  Object.freeze(result.income);
  Object.freeze(result.commitment);
  Object.freeze(result.budget);
  return Object.freeze(result);
}

export function validateCashClarityCurrencyPrecision(
  draft: CashClarityDraft,
  precision: number,
): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    invalid('Currency precision is invalid.');
  }
  const values = [
    ...draft.accounts.map(account => account.balance),
    ...draft.accounts.flatMap(account =>
      account.cardPaymentAmount === undefined ? [] : [account.cardPaymentAmount],
    ),
    ...(draft.income.kind === 'recurring' ? draft.income.items.map(item => item.amount) : []),
    ...(draft.commitment.kind === 'payment' ? draft.commitment.items.map(item => item.amount) : []),
    ...(draft.budget.kind === 'set' ? draft.budget.items.map(item => item.amount) : []),
  ];
  if (values.some(value => Math.abs(value - roundToPrecision(value, precision)) > 1e-8)) {
    invalid(`Amounts must use no more than ${precision} decimal places.`);
  }
}
