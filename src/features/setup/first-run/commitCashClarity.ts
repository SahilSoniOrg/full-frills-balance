import { database } from '@/src/data/database/Database';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  runAccountingWriteSession,
  stageModelWrite,
} from '@/src/data/repositories/AccountingWriteSession';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { workplaceService } from '@/src/services/WorkplaceService';
import { analytics } from '@/src/services/analytics';
import { preferences } from '@/src/services/preferences';
import { finishDeviceSetup } from '../setupFinishers';
import { clearSetupDraft } from '../SetupDraftStore';
import { clearPendingCashClarityWorkplaceId } from './pendingWorkplace';
import { buildCreatePersistenceInput } from '@/src/services/planned-payment/plannedPaymentSchedulePolicy';
import { buildOnboardingIncomeRecurrence } from './incomeRecurrence';
import { journalLegTypesForSignedAmount } from '@/src/services/accounts/accountRules';
import { AuditAction, JournalStatus, PlannedPaymentInterval } from '@/src/types/enums';
import {
  asAccountId,
  asBudgetId,
  asJournalId,
  asPlannedPaymentId,
  type WorkplaceId,
} from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { roundToPrecision } from '@/src/utils/money';
import { generateWorkplaceName } from '@/src/utils/workplaceName';
import { logger } from '@/src/utils/logger';
import type { CashClarityDraft } from './draft';
import {
  ACCOUNT_KIND_META,
  budgetLookupName,
  incomeItemName,
  incomeSourceName,
  isSpendableAccount,
  paymentCategoryName,
  paymentItemName,
  subtypeForAccount,
  type CommitmentKind,
  type IncomeDraft,
  type CommitmentDraft,
} from './draft';
import {
  draftAccountId,
  mapDraftToWorkplaceOutput,
  starterCategoryId,
} from './mapToWorkplaceOutput';

const PUBLICATION_RECEIPT_PREFIX = 'cash-clarity-publication:';

export type CashClarityPublicationOutcome = {
  readonly workplaceId: WorkplaceId;
  readonly status: 'published' | 'already_published';
};

export type CashClarityPublicationErrorCode =
  | 'invalid_input'
  | 'missing_spendable_account'
  | 'ambiguous_existing_publication'
  | 'incomplete_publication'
  | 'save_failed';

export class CashClarityPublicationError extends Error {
  constructor(
    readonly code: CashClarityPublicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CashClarityPublicationError';
  }
}

type PublicationManifest = {
  operationId: string;
  accountIds: string[];
  journalIds: string[];
  plannedPaymentIds: string[];
  budgetIds: string[];
  budgetScopeIds: string[];
};

type AtomicPublicationResult = {
  readonly status: CashClarityPublicationOutcome['status'];
  readonly workplaceId: WorkplaceId;
  readonly journals: JournalPersistenceResult[];
};

function invalid(message: string): never {
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

function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !dayjs(value).isValid()) {
    invalid(`${label} must be a valid date.`);
  }
}

function assertName(value: unknown, label: string, optional = false): asserts value is string {
  if (typeof value !== 'string' || (!optional && !value.trim())) {
    invalid(`${label} is required.`);
  }
}

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const candidate of items as readonly unknown[]) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || ids.has(candidate.id)) {
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

function validateDraft(draft: CashClarityDraft): void {
  if (!isRecord(draft)) invalid('Setup details are malformed.');
  assertName(draft.operationId, 'Setup operation ID');
  assertName(draft.workplaceName, 'Workplace name');
  assertName(draft.workplaceIcon, 'Workplace icon');
  assertName(draft.displayName, 'Device name', true);
  if (typeof draft.currency !== 'string' || !/^[A-Z]{3}$/.test(draft.currency)) {
    invalid('Choose a supported currency.');
  }
  if (!Array.isArray(draft.accounts)) invalid('Account setup is malformed.');
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
    if (account.kind !== 'card' && (account.cardPaymentAmount !== undefined || account.cardPaymentDate !== undefined)) {
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

function snapshotDraft(draft: CashClarityDraft): CashClarityDraft {
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
    income,
    commitment,
    budget,
  };
  result.accounts.forEach(account => Object.freeze(account));
  Object.freeze(result.accounts);
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

function receiptId(operationId: WorkplaceId): string {
  return `${PUBLICATION_RECEIPT_PREFIX}${operationId}`;
}

function stableItemId(
  kind: 'journal' | 'planned-payment' | 'budget',
  operationId: WorkplaceId,
  itemId: string,
): string {
  return `cash-clarity:${operationId}:${kind}:${itemId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function readManifest(receipt: { parsedChanges: Record<string, unknown> | null }): PublicationManifest | undefined {
  const after = receipt.parsedChanges?.after;
  if (!isRecord(after)) return undefined;
  if (
    typeof after.operationId !== 'string' ||
    !isStringArray(after.accountIds) ||
    !isStringArray(after.journalIds) ||
    !isStringArray(after.plannedPaymentIds) ||
    !isStringArray(after.budgetIds) ||
    !isStringArray(after.budgetScopeIds)
  ) {
    return undefined;
  }
  return {
    operationId: after.operationId,
    accountIds: after.accountIds,
    journalIds: after.journalIds,
    plannedPaymentIds: after.plannedPaymentIds,
    budgetIds: after.budgetIds,
    budgetScopeIds: after.budgetScopeIds,
  };
}

async function countIds(table: string, workplaceId: WorkplaceId, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return (
    await database
      .get(table)
      .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf([...ids])))
      .fetch()
  ).length;
}

async function verifyCompletedPublication(
  workplaceId: WorkplaceId,
  receipt: NonNullable<Awaited<ReturnType<typeof auditRepository.find>>>,
): Promise<void> {
  const manifest = readManifest(receipt);
  if (
    receipt.eventType !== 'workplace.setup_published' ||
    receipt.entityId !== workplaceId ||
    manifest?.operationId !== workplaceId ||
    !manifest
  ) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'The saved setup receipt is incomplete. Keep this setup for recovery.',
    );
  }
  const checks = await Promise.all([
    countIds('accounts', workplaceId, manifest.accountIds),
    countIds('journals', workplaceId, manifest.journalIds),
    countIds('planned_payments', workplaceId, manifest.plannedPaymentIds),
    countIds('budgets', workplaceId, manifest.budgetIds),
    countIds('budget_scopes', workplaceId, manifest.budgetScopeIds),
  ]);
  const expected = [
    manifest.accountIds.length,
    manifest.journalIds.length,
    manifest.plannedPaymentIds.length,
    manifest.budgetIds.length,
    manifest.budgetScopeIds.length,
  ];
  if (checks.some((count, index) => count !== expected[index])) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'Saved setup records are incomplete. Keep this setup for recovery.',
    );
  }
}

function accountInputs(draft: CashClarityDraft, workplaceId: WorkplaceId) {
  const output = mapDraftToWorkplaceOutput(draft);
  const accounts = draft.accounts.map(account => ({
    id: draftAccountId(workplaceId, account.id),
    name: account.name.trim() || ACCOUNT_KIND_META[account.kind].name,
    accountType: ACCOUNT_KIND_META[account.kind].type,
    accountSubtype: subtypeForAccount(account),
    currencyCode: draft.currency,
    icon: ACCOUNT_KIND_META[account.kind].icon,
    workplaceId,
  }));
  const categories = output.selectedCategories.map(category => ({
    id: category.id ?? starterCategoryId(workplaceId, category.name),
    name: category.name,
    accountType: category.type,
    currencyCode: draft.currency,
    icon: category.icon,
    workplaceId,
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
  const categoryIds = new Set(categories.map(item => item.id));
  const referencedCategoryNames = [
    ...(draft.income.kind === 'recurring'
      ? draft.income.items.map(item => incomeSourceName(item.source))
      : []),
    ...(draft.commitment.kind === 'payment'
      ? draft.commitment.items.map(item => paymentCategoryName(item.type))
      : []),
    ...(draft.budget.kind === 'set' ? draft.budget.items.map(budgetLookupName) : []),
  ];
  if (
    referencedCategoryNames.some(name => !categoryIds.has(starterCategoryId(workplaceId, name)))
  ) {
    invalid('A planned item refers to a missing category.');
  }
  return { output, accounts: [...accounts, ...categories] };
}

function validateCurrencyPrecision(draft: CashClarityDraft, precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    invalid('Currency precision is invalid.');
  }
  const values = [
    ...draft.accounts.map(account => account.balance),
    ...(draft.accounts.flatMap(account =>
      account.cardPaymentAmount === undefined ? [] : [account.cardPaymentAmount],
    )),
    ...(draft.income.kind === 'recurring' ? draft.income.items.map(item => item.amount) : []),
    ...(draft.commitment.kind === 'payment' ? draft.commitment.items.map(item => item.amount) : []),
    ...(draft.budget.kind === 'set' ? draft.budget.items.map(item => item.amount) : []),
  ];
  if (values.some(value => Math.abs(value - roundToPrecision(value, precision)) > 1e-8)) {
    invalid(`Amounts must use no more than ${precision} decimal places.`);
  }
}

function plannedPaymentId(operationId: WorkplaceId, itemId: string) {
  return asPlannedPaymentId(stableItemId('planned-payment', operationId, itemId));
}

async function uniqueDefaultName(name: string, isDefault: boolean): Promise<string> {
  if (!isDefault) return name;
  const existingNames = new Set(
    (await workplaceService.getAllWorkplaces()).map(workplace => workplace.name.toLowerCase()),
  );
  if (!existingNames.has(name.toLowerCase())) return name;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateWorkplaceName();
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
  }
  let suffix = 2;
  while (existingNames.has(`${name} ${suffix}`.toLowerCase())) suffix += 1;
  return `${name} ${suffix}`;
}

/** Publishes all Cash Clarity books and its completion receipt in one database transaction. */
export async function publishCashClarity(
  draft: CashClarityDraft,
): Promise<CashClarityPublicationOutcome> {
  validateDraft(draft);
  const submitted = snapshotDraft(draft);
  let precision: number;
  try {
    precision = await currencyReadService.getPrecision(submitted.currency);
  } catch {
    invalid('Choose a supported currency.');
  }
  validateCurrencyPrecision(submitted, precision);
  const { output, accounts } = accountInputs(submitted, submitted.operationId);
  let workplaceName: string;
  try {
    workplaceName = await uniqueDefaultName(
      output.name.value,
      output.name.source === 'defaulted',
    );
  } catch (cause) {
    throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
  }

  const needsSpendableAccount =
    (submitted.income.kind === 'recurring' && submitted.income.items.length > 0) ||
    (submitted.commitment.kind === 'payment' && submitted.commitment.items.length > 0) ||
    (submitted.budget.kind === 'set' && submitted.budget.items.length > 0) ||
    submitted.accounts.some(account => account.kind === 'card' && account.cardPaymentAmount !== undefined);
  const spendable = submitted.accounts.find(isSpendableAccount);
  if (needsSpendableAccount && !spendable) {
    throw new CashClarityPublicationError(
      'missing_spendable_account',
      'Add a spendable account before saving planned money.',
    );
  }
  const payFromId = spendable ? draftAccountId(submitted.operationId, spendable.id) : undefined;
  const manifest: PublicationManifest = {
    operationId: submitted.operationId,
    accountIds: [
      asAccountId(`${submitted.operationId}:system:opening-balances`),
      asAccountId(`${submitted.operationId}:system:balance-corrections`),
      ...accounts.map(account => account.id),
    ],
    journalIds: submitted.accounts
      .filter(account => account.balance !== 0)
      .map(account => stableItemId('journal', submitted.operationId, account.id)),
    plannedPaymentIds: [],
    budgetIds: [],
    budgetScopeIds: [],
  };
  if (submitted.income.kind === 'recurring') {
    manifest.plannedPaymentIds.push(
      ...submitted.income.items.map(item => plannedPaymentId(submitted.operationId, `income:${item.id}`)),
    );
  }
  if (submitted.commitment.kind === 'payment') {
    manifest.plannedPaymentIds.push(
      ...submitted.commitment.items.map(item => plannedPaymentId(submitted.operationId, `payment:${item.id}`)),
    );
  }
  manifest.plannedPaymentIds.push(
    ...submitted.accounts.flatMap(account =>
      account.cardPaymentAmount === undefined
        ? []
        : [plannedPaymentId(submitted.operationId, `card-payment:${account.id}`)],
    ),
  );
  if (submitted.budget.kind === 'set') {
    for (const item of submitted.budget.items) {
      const id = stableItemId('budget', submitted.operationId, item.id);
      manifest.budgetIds.push(id);
      manifest.budgetScopeIds.push(
        `${id}:scope:${starterCategoryId(submitted.operationId, budgetLookupName(item))}`,
      );
    }
  }

  let result: AtomicPublicationResult;
  try {
    result = await runAccountingWriteSession<AtomicPublicationResult>(async session => {
    const receipt = await auditRepository.find(receiptId(submitted.operationId), submitted.operationId);
    if (receipt) {
      const existingWorkplace = await workplaceRepository.find(submitted.operationId);
      if (!existingWorkplace) {
        throw new CashClarityPublicationError(
          'incomplete_publication',
          'The setup receipt exists without its Workplace. Keep this setup for recovery.',
        );
      }
      await verifyCompletedPublication(submitted.operationId, receipt);
      return { status: 'already_published' as const, workplaceId: submitted.operationId, journals: [] };
    }

    if (await workplaceRepository.find(submitted.operationId)) {
      throw new CashClarityPublicationError(
        'ambiguous_existing_publication',
        'This Workplace was created by an older partial save and needs recovery before retrying.',
      );
    }

    await workplaceRepository.createSetupInSession(session, {
      id: submitted.operationId,
      name: workplaceName,
      icon: output.icon.value,
      defaultCurrencyCode: submitted.currency,
      accounts,
    });

    const openingId = asAccountId(`${submitted.operationId}:system:opening-balances`);
    const journalResults: JournalPersistenceResult[] = [];
    for (const account of submitted.accounts) {
      if (account.balance === 0) continue;
      const accountId = draftAccountId(submitted.operationId, account.id);
      const accountType = ACCOUNT_KIND_META[account.kind].type;
      const legTypes = journalLegTypesForSignedAmount(accountType, account.balance);
      const journalId = asJournalId(
        stableItemId('journal', submitted.operationId, account.id),
      );
      journalResults.push(
        await journalPersistenceService.putInSession(
          session,
          {
            createJournalId: journalId,
            journalDate: Date.now(),
            description: `Opening balance · ${account.name.trim() || ACCOUNT_KIND_META[account.kind].name}`,
            currencyCode: submitted.currency,
            status: JournalStatus.POSTED,
            transactions: [
              {
                accountId,
                amount: Math.abs(account.balance),
                transactionType: legTypes.accountTxType,
              },
              {
                accountId: openingId,
                amount: Math.abs(account.balance),
                transactionType: legTypes.balancingTxType,
              },
            ],
          },
          submitted.operationId,
          { source: 'system', eventType: 'journal.opening_balance_created', undoable: false },
        ),
      );
    }

    if (payFromId && submitted.income.kind === 'recurring') {
      for (const item of submitted.income.items) {
        const recurrence = buildOnboardingIncomeRecurrence(item);
        await plannedPaymentRepository.createInSession(
          session,
          submitted.operationId,
          plannedPaymentId(submitted.operationId, `income:${item.id}`),
          buildCreatePersistenceInput({
            name: incomeItemName(item),
            amount: item.amount,
            currencyCode: submitted.currency,
            fromAccountId: starterCategoryId(
              submitted.operationId,
              incomeSourceName(item.source),
            ),
            toAccountId: payFromId,
            intervalN: recurrence.intervalN,
            intervalType: recurrence.intervalType,
            startDate: recurrence.firstOccurrence,
            isAutoPost: false,
            recurrenceDay: recurrence.recurrenceDay,
            recurrenceMonth: recurrence.recurrenceMonth,
          }),
          submitted.operationId,
        );
      }
    }
    if (payFromId && submitted.commitment.kind === 'payment') {
      for (const item of submitted.commitment.items) {
        await plannedPaymentRepository.createInSession(
          session,
          submitted.operationId,
          plannedPaymentId(submitted.operationId, `payment:${item.id}`),
          buildCreatePersistenceInput({
            name: paymentItemName(item),
            amount: item.amount,
            currencyCode: submitted.currency,
            fromAccountId: payFromId,
            toAccountId: starterCategoryId(
              submitted.operationId,
              paymentCategoryName(item.type),
            ),
            intervalN: 1,
            intervalType: PlannedPaymentInterval.MONTHLY,
            startDate: dayjs(item.dueDate).startOf('day').valueOf(),
            isAutoPost: false,
            recurrenceDay: dayjs(item.dueDate).date(),
          }),
          submitted.operationId,
        );
      }
    }
    for (const account of submitted.accounts) {
      if (account.kind !== 'card' || account.cardPaymentAmount === undefined || !payFromId) continue;
      await plannedPaymentRepository.createInSession(
        session,
        submitted.operationId,
        plannedPaymentId(submitted.operationId, `card-payment:${account.id}`),
        buildCreatePersistenceInput({
          name: `Card payment · ${account.name.trim() || ACCOUNT_KIND_META.card.name}`,
          amount: account.cardPaymentAmount,
          currencyCode: submitted.currency,
          fromAccountId: payFromId,
          toAccountId: draftAccountId(submitted.operationId, account.id),
          intervalN: 1,
          intervalType: PlannedPaymentInterval.MONTHLY,
          startDate: dayjs(account.cardPaymentDate).startOf('day').valueOf(),
          isAutoPost: false,
          recurrenceDay: dayjs(account.cardPaymentDate).date(),
        }),
        submitted.operationId,
      );
    }
    if (payFromId && submitted.budget.kind === 'set') {
      const now = dayjs();
      for (const item of submitted.budget.items) {
        const budgetId = asBudgetId(stableItemId('budget', submitted.operationId, item.id));
        await budgetRepository.createInSession(
          session,
          submitted.operationId,
          budgetId,
          {
            name: item.name.trim(),
            amount: item.amount,
            currencyCode: submitted.currency,
            startMonth: now.format('YYYY-MM'),
            intervalType: PlannedPaymentInterval.MONTHLY,
            intervalN: 1,
            startDate: now.startOf('month').valueOf(),
            recurrenceDay: 1,
            assetAccountIds: [payFromId],
          },
          [starterCategoryId(submitted.operationId, budgetLookupName(item))],
          submitted.operationId,
        );
      }
    }

    stageModelWrite(session, [
      auditRepository.prepareLog(
        {
          id: receiptId(submitted.operationId),
          entityType: 'workplace',
          entityId: submitted.operationId,
          action: AuditAction.CREATE,
          eventType: 'workplace.setup_published',
          source: 'system',
          correlationId: submitted.operationId,
          undoable: false,
          changes: { after: manifest },
        },
        submitted.operationId,
      ),
    ]);
    return {
      status: 'published' as const,
      workplaceId: submitted.operationId,
      journals: journalResults,
    };
    });
  } catch (cause) {
    if (cause instanceof CashClarityPublicationError) throw cause;
    throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
  }

  if (result.journals.length > 0) {
    try {
      journalPersistenceService.afterAtomicWriteCommit(result.journals, result.workplaceId);
    } catch {
      // The receipt proves books committed; a rebuild-queue problem must not invite republishing.
      logger.error('[CashClarity] Opening balance rebuild enqueue failed after publication', {
        operationId: result.workplaceId,
      });
    }
  }
  return { workplaceId: result.workplaceId, status: result.status };
}

/**
 * Compatibility wrapper for the retired first-run screen. New setup code must call
 * publishCashClarity, then let LaunchCoordinator activate the returned Workplace and
 * the setup coordinator register the Device, emit analytics, and clear the draft last.
 */
export async function commitCashClarity(draft: CashClarityDraft): Promise<WorkplaceId> {
  if (typeof draft.displayName !== 'string' || !draft.displayName.trim()) {
    throw new CashClarityPublicationError('invalid_input', 'Could not save your name.');
  }
  const wasDeviceRegistered = preferences.device.deviceRegistered;
  const outcome = await publishCashClarity(draft);
  const { workplaceId } = outcome;
  if (outcome.status === 'published') {
    analytics.trackFeatureUsage('settings', 'workplace_created', {
      name_length: draft.workplaceName.trim().length,
      icon: draft.workplaceIcon,
    });
  }
  if (!wasDeviceRegistered) {
    finishDeviceSetup({ displayName: { value: draft.displayName.trim(), source: 'user_entered' } });
    analytics.track('onboarding_complete');
    analytics.trackConversion('onboarding_completed');
  }
  preferences.device.setActiveWorkplaceId(workplaceId);
  clearPendingCashClarityWorkplaceId();
  clearSetupDraft();
  return workplaceId;
}
