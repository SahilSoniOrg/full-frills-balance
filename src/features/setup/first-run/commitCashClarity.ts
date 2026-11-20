import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { cashClarityPublicationRepository } from '@/src/data/repositories/CashClarityPublicationRepository';
import {
  runAccountingWriteSession,
  stageModelWrite,
  stageBalanceRebuildIntents,
} from '@/src/data/repositories/AccountingWriteSession';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import type {
  JournalPersistenceResult,
  JournalRebuildImpact,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { workplaceService } from '@/src/services/WorkplaceService';
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
import dayjs from 'dayjs';
import { generateWorkplaceName } from '@/src/services/setup/workplaceName';
import type { CashClarityDraft } from './draft';
import {
  invalid,
  snapshotCashClarityDraft,
  validateCashClarityCurrencyPrecision,
  validateCashClarityDraft,
} from './cashClarityPublicationValidation';
import {
  CashClarityPublicationError,
  type CashClarityPublicationOutcome,
} from './cashClarityPublicationTypes';
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
} from './cashClarityPublicationTypes';

const PUBLICATION_RECEIPT_PREFIX = 'cash-clarity-publication:';

type PublicationManifest = {
  operationId: string;
  accountIds: string[];
  journalIds: string[];
  plannedPaymentIds: string[];
  budgetIds: string[];
  budgetScopeIds: string[];
  balanceRebuildAccountIds?: string[];
  balanceRebuildFromDate?: number | null;
};

type AtomicPublicationResult = {
  readonly status: CashClarityPublicationOutcome['status'];
  readonly workplaceId: WorkplaceId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function readManifest(receipt: {
  parsedChanges: Record<string, unknown> | null;
}): PublicationManifest | undefined {
  const after = receipt.parsedChanges?.after;
  if (!isRecord(after)) return undefined;
  const hasRebuildAccounts = after.balanceRebuildAccountIds !== undefined;
  const hasRebuildDate = after.balanceRebuildFromDate !== undefined;
  if (
    typeof after.operationId !== 'string' ||
    !isStringArray(after.accountIds) ||
    !isStringArray(after.journalIds) ||
    !isStringArray(after.plannedPaymentIds) ||
    !isStringArray(after.budgetIds) ||
    !isStringArray(after.budgetScopeIds) ||
    hasRebuildAccounts !== hasRebuildDate ||
    (hasRebuildAccounts && !isStringArray(after.balanceRebuildAccountIds)) ||
    (hasRebuildDate &&
      !(
        after.balanceRebuildFromDate === null ||
        (typeof after.balanceRebuildFromDate === 'number' &&
          Number.isFinite(after.balanceRebuildFromDate) &&
          after.balanceRebuildFromDate > 0)
      )) ||
    (hasRebuildAccounts &&
      (after.balanceRebuildAccountIds as string[]).length > 0 &&
      after.balanceRebuildFromDate === null) ||
    (hasRebuildAccounts &&
      (after.journalIds as string[]).length > 0 !==
        (after.balanceRebuildAccountIds as string[]).length > 0)
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
    ...(hasRebuildAccounts
      ? { balanceRebuildAccountIds: after.balanceRebuildAccountIds as string[] }
      : {}),
    ...(hasRebuildDate
      ? { balanceRebuildFromDate: after.balanceRebuildFromDate as number | null }
      : {}),
  };
}

async function verifyCompletedPublication(
  workplaceId: WorkplaceId,
  receipt: NonNullable<Awaited<ReturnType<typeof auditRepository.find>>>,
): Promise<JournalRebuildImpact> {
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
  if (!(await cashClarityPublicationRepository.hasCompletePublication(workplaceId, manifest))) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'Saved setup records are incomplete. Keep this setup for recovery.',
    );
  }
  let accountIds: string[];
  let fromDate: number | null;
  if (
    manifest.balanceRebuildAccountIds !== undefined &&
    manifest.balanceRebuildFromDate !== undefined
  ) {
    accountIds = manifest.balanceRebuildAccountIds;
    fromDate = manifest.balanceRebuildFromDate;
  } else {
    const recovered = await cashClarityPublicationRepository.findBalanceRebuildImpact(
      workplaceId,
      manifest.journalIds,
    );
    accountIds = [...recovered.accountIds];
    fromDate = recovered.fromDate;
  }
  if (
    accountIds.some(id => !manifest.accountIds.includes(id)) ||
    (manifest.journalIds.length > 0 && (accountIds.length === 0 || fromDate === null))
  ) {
    throw new CashClarityPublicationError(
      'incomplete_publication',
      'Saved opening balances are incomplete. Keep this setup for recovery.',
    );
  }
  return {
    affectedAccountIds: new Set(accountIds.map(asAccountId)),
    rebuildFromDate: fromDate ?? Date.now(),
  };
}

function accountInputs(draft: CashClarityDraft, workplaceId: WorkplaceId) {
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
      workplaceId,
    };
  });
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
  const categoryIdForName = (name: string) => {
    const id = categoryIdsByName.get(name.trim().toLowerCase());
    if (!id) invalid('A planned item refers to a missing category.');
    return id as ReturnType<typeof asAccountId>;
  };
  return { output, accounts: [...accounts, ...categories], categoryIdForName };
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
  const { output, accounts, categoryIdForName } = accountInputs(submitted, submitted.operationId);

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
    balanceRebuildAccountIds: [],
    balanceRebuildFromDate: null,
  };
  if (submitted.income.kind === 'recurring') {
    manifest.plannedPaymentIds.push(
      ...submitted.income.items.map(item =>
        plannedPaymentId(submitted.operationId, `income:${item.id}`),
      ),
    );
  }
  if (submitted.commitment.kind === 'payment') {
    manifest.plannedPaymentIds.push(
      ...submitted.commitment.items.map(item =>
        plannedPaymentId(submitted.operationId, `payment:${item.id}`),
      ),
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
        `${id}:scope:${categoryIdForName(budgetLookupName(item, submitted.preservedStarterCategories))}`,
      );
    }
  }

  let result: AtomicPublicationResult;
  try {
    result = await runAccountingWriteSession<AtomicPublicationResult>(async session => {
      const receipt = await auditRepository.find(
        receiptId(submitted.operationId),
        submitted.operationId,
      );
      if (receipt) {
        const existingWorkplace = await workplaceRepository.find(submitted.operationId);
        if (!existingWorkplace) {
          throw new CashClarityPublicationError(
            'incomplete_publication',
            'The setup receipt exists without its Workplace. Keep this setup for recovery.',
          );
        }
        const impact = await verifyCompletedPublication(submitted.operationId, receipt);
        stageBalanceRebuildIntents(
          session,
          submitted.operationId,
          impact.affectedAccountIds,
          impact.rebuildFromDate,
        );
        return {
          status: 'already_published' as const,
          workplaceId: submitted.operationId,
        };
      }

      if (await workplaceRepository.find(submitted.operationId)) {
        throw new CashClarityPublicationError(
          'ambiguous_existing_publication',
          'This Workplace was created by an older partial save and needs recovery before retrying.',
        );
      }

      let workplaceName: string;
      try {
        workplaceName = await uniqueDefaultName(
          output.name.value,
          output.name.source === 'defaulted' && !options.preserveWorkplaceName,
        );
      } catch (cause) {
        throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
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
        const accountId = publishedDraftAccountId(submitted, account);
        const accountType = ACCOUNT_KIND_META[account.kind].type;
        const legTypes = journalLegTypesForSignedAmount(accountType, account.balance);
        const journalId = asJournalId(stableItemId('journal', submitted.operationId, account.id));
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
              fromAccountId: categoryIdForName(incomeSourceName(item.source)),
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
              toAccountId: categoryIdForName(paymentCategoryName(item.type)),
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
        if (account.kind !== 'card' || account.cardPaymentAmount === undefined || !payFromId)
          continue;
        await plannedPaymentRepository.createInSession(
          session,
          submitted.operationId,
          plannedPaymentId(submitted.operationId, `card-payment:${account.id}`),
          buildCreatePersistenceInput({
            name: `Card payment · ${account.name.trim() || ACCOUNT_KIND_META.card.name}`,
            amount: account.cardPaymentAmount,
            currencyCode: submitted.currency,
            fromAccountId: payFromId,
            toAccountId: publishedDraftAccountId(submitted, account),
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
            [categoryIdForName(budgetLookupName(item, submitted.preservedStarterCategories))],
            submitted.operationId,
          );
        }
      }

      const affectedAccountIds = new Set(
        journalResults.flatMap(result => [...result.affectedAccountIds]),
      );
      const rebuildFromDate = journalResults.length
        ? Math.min(...journalResults.map(result => result.rebuildFromDate))
        : null;
      manifest.balanceRebuildAccountIds = [...affectedAccountIds];
      manifest.balanceRebuildFromDate = rebuildFromDate;
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
      };
    });
  } catch (cause) {
    if (cause instanceof CashClarityPublicationError) throw cause;
    throw new CashClarityPublicationError('save_failed', 'Could not save setup.', { cause });
  }

  return { workplaceId: result.workplaceId, status: result.status };
}

/** Verify saved books and replay derived effects without accepting another creation payload. */
export async function recoverCashClarityPublication(
  workplaceId: WorkplaceId,
): Promise<CashClarityPublicationOutcome> {
  try {
    await runAccountingWriteSession(async session => {
      const receipt = await auditRepository.find(receiptId(workplaceId), workplaceId);
      const workplace = await workplaceRepository.find(workplaceId);
      if (!receipt || !workplace) {
        throw new CashClarityPublicationError(
          workplace && !receipt ? 'ambiguous_existing_publication' : 'incomplete_publication',
          'Saved setup needs recovery before it can be opened.',
        );
      }
      const impact = await verifyCompletedPublication(workplaceId, receipt);
      stageBalanceRebuildIntents(
        session,
        workplaceId,
        impact.affectedAccountIds,
        impact.rebuildFromDate,
      );
    });
    return { workplaceId, status: 'already_published' };
  } catch (cause) {
    if (cause instanceof CashClarityPublicationError) throw cause;
    throw new CashClarityPublicationError(
      'finalization_failed',
      'Books are saved, but setup could not finish. Try again.',
      { cause },
    );
  }
}
