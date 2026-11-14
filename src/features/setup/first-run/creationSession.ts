import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import { Icon, isValidIconName } from '@/src/types/domainIcons';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import type { CashClaritySetupDraft, SetupEntryPolicy, SetupFactSource, CreationContext, CreationIntent } from '../setupTypes';
import type { AccountKind, CashClarityDraft, CashClarityEditableInput, OnboardingStep } from './draft';
import { cashClarityWorkplaceId } from './pendingWorkplace';
import { ONBOARDING_STEPS } from './flow';
import { getLocales } from 'expo-localization';

export const CASH_CLARITY_SETUP_SCHEMA_VERSION = 2 as const;

const ACCOUNT_KINDS: readonly AccountKind[] = ['bank', 'cash', 'savings', 'card'];
const SOURCES = ['salary', 'family', 'retirement', 'freelance', 'other'] as const;
const COMMITMENTS = ['rent', 'subscription', 'loan', 'utilities'] as const;
const COLLECTIONS = ['accounts', 'income', 'commitment', 'budget'] as const;
const FACT_SOURCES: readonly SetupFactSource[] = ['user_entered', 'imported', 'existing', 'defaulted'];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === 'string';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every(key => set.has(key));
}

function validAmountKey(input: CashClarityEditableInput, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(input.amountTextById, id);
}

function validPositiveItems(
  value: unknown,
  type: 'income' | 'commitment' | 'budget',
  input: CashClarityEditableInput,
): boolean {
  if (!Array.isArray(value)) return false;
  const ids = value.map(candidate => record(candidate) ? candidate.id : undefined);
  if (new Set(ids).size !== ids.length) return false;
  return value.every(candidate => {
    if (!record(candidate) || !onlyKeys(candidate, type === 'income'
      ? ['id', 'name', 'source', 'amount', 'interval', 'intervalN', 'nextDate']
      : type === 'commitment'
        ? ['id', 'name', 'type', 'amount', 'dueDate']
        : ['id', 'name', 'amount', 'category']) ||
      !string(candidate.id) || !candidate.id.trim() || !string(candidate.name)) return false;
    if (candidate.amount !== undefined && !finite(candidate.amount)) return false;
    if (candidate.amount === undefined && !validAmountKey(input, candidate.id)) return false;
    if (type === 'income') {
      return SOURCES.includes(candidate.source as (typeof SOURCES)[number]) &&
        Object.values(PlannedPaymentInterval).includes(candidate.interval as PlannedPaymentInterval) &&
        Number.isInteger(candidate.intervalN) && finite(candidate.nextDate);
    }
    if (type === 'commitment') return COMMITMENTS.includes(candidate.type as (typeof COMMITMENTS)[number]) && finite(candidate.dueDate);
    return candidate.category === undefined || string(candidate.category);
  });
}

function validDraft(value: unknown, input: CashClarityEditableInput, operationId: string): value is CashClarityDraft {
  if (!record(value) || !onlyKeys(value, ['operationId', 'displayName', 'workplaceName', 'workplaceIcon', 'currency', 'accounts', 'income', 'commitment', 'budget', 'preservedStarterAccounts', 'preservedStarterCategories']) ||
    value.operationId !== operationId || !string(value.displayName) ||
    !string(value.workplaceName) || !string(value.currency) || !isValidIconName(String(value.workplaceIcon)) ||
    !Array.isArray(value.accounts)) return false;
  const accountsValid = value.accounts.every(candidate => {
    if (!record(candidate) || !onlyKeys(candidate, ['id', 'kind', 'name', 'balance', 'spendable', 'cardPaymentAmount', 'cardPaymentDate']) || !string(candidate.id) || !candidate.id.trim() ||
      !ACCOUNT_KINDS.includes(candidate.kind as AccountKind) || !string(candidate.name)) return false;
    if (candidate.balance !== undefined && !finite(candidate.balance)) return false;
    if (candidate.balance === undefined && !validAmountKey(input, candidate.id)) return false;
    if (candidate.spendable !== undefined && typeof candidate.spendable !== 'boolean') return false;
    if (candidate.cardPaymentAmount !== undefined && !finite(candidate.cardPaymentAmount)) return false;
    if (candidate.cardPaymentAmount === undefined && validAmountKey(input, `${candidate.id}:card-payment`) &&
      candidate.kind !== 'card') return false;
    return candidate.cardPaymentDate === undefined || finite(candidate.cardPaymentDate);
  });
  if (!accountsValid) return false;
  const income = value.income;
  const commitment = value.commitment;
  const budget = value.budget;
  if (!record(income) || !record(commitment) || !record(budget)) return false;
  const incomeValid = income.kind === 'unset' || income.kind === 'skipped' ||
    (income.kind === 'recurring' && validPositiveItems(income.items, 'income', input));
  const commitmentValid = commitment.kind === 'unset' || commitment.kind === 'skipped' ||
    (commitment.kind === 'payment' && validPositiveItems(commitment.items, 'commitment', input));
  const budgetValid = budget.kind === 'unset' || budget.kind === 'skipped' ||
    (budget.kind === 'set' && validPositiveItems(budget.items, 'budget', input));
  const preservedAccounts = value.preservedStarterAccounts;
  const preservedCategories = value.preservedStarterCategories;
  const validPreserved = (items: unknown, category: boolean) => items === undefined ||
    (Array.isArray(items) && items.every(item => record(item) && onlyKeys(item, ['id', 'name', 'type', 'icon']) && string(item.name) &&
      Object.values(AccountType).includes(item.type as AccountType) && isValidIconName(String(item.icon)) &&
      (item.id === undefined || string(item.id)) && (!category || item.type === AccountType.INCOME || item.type === AccountType.EXPENSE)));
  const accountIds = new Set(value.accounts.map(account => record(account) ? account.id : undefined));
  return accountIds.size === value.accounts.length && incomeValid && commitmentValid && budgetValid && validPreserved(preservedAccounts, false) && validPreserved(preservedCategories, true);
}

function parseEditableInput(value: unknown): CashClarityEditableInput | undefined {
  if (!record(value) || !onlyKeys(value, ['amountTextById', 'deferredCollections']) || !record(value.amountTextById)) return undefined;
  const amountTextById = value.amountTextById;
  if (!Object.values(amountTextById).every(string)) return undefined;
  if (value.deferredCollections !== undefined) {
    if (!record(value.deferredCollections) || Object.keys(value.deferredCollections).some(key => !COLLECTIONS.includes(key as (typeof COLLECTIONS)[number])) ||
      !Object.values(value.deferredCollections).every(item => typeof item === 'boolean')) return undefined;
  }
  const rawAmounts: Record<string, string> = {};
  for (const [key, raw] of Object.entries(amountTextById)) {
    if (typeof raw === 'string') rawAmounts[key] = raw;
  }
  const deferredCollections: Partial<Record<(typeof COLLECTIONS)[number], boolean>> = {};
  if (record(value.deferredCollections)) {
    for (const collection of COLLECTIONS) {
      const flag = value.deferredCollections[collection];
      if (typeof flag === 'boolean') deferredCollections[collection] = flag;
    }
  }
  return { amountTextById: rawAmounts, deferredCollections };
}

export function parseCashClaritySetupDraft(value: unknown): CashClaritySetupDraft | undefined {
  if (!record(value) || !onlyKeys(value, ['schemaVersion', 'kind', 'journeyId', 'intent', 'context', 'entryPolicy', 'operationId', 'draft', 'editableInput', 'inputLocale', 'step', 'history', 'completedActions', 'repairReturnStep', 'publication', 'publicationErrorCode', 'legacyProvenance']) || value.schemaVersion !== CASH_CLARITY_SETUP_SCHEMA_VERSION || value.kind !== 'cash_clarity') return undefined;
  if (typeof value.inputLocale !== 'string' || !value.inputLocale.trim()) return undefined;
  try { new Intl.NumberFormat(value.inputLocale); } catch { return undefined; }
  const intent = value.intent;
  const context = value.context;
  const entryPolicy = value.entryPolicy;
  const journeyId = value.journeyId;
  if ((intent !== 'first_run' && intent !== 'add_workplace') ||
    !['unregistered_device', 'registered_empty_device', 'workplace_picker', 'existing_workplace_entry'].includes(String(context)) ||
    (entryPolicy !== 'blocking' && entryPolicy !== 'optional') ||
    journeyId !== (intent === 'first_run' ? 'first_run' : 'add_workplace') ||
    (intent === 'first_run' && (context !== 'unregistered_device' || entryPolicy !== 'blocking')) ||
    (intent === 'add_workplace' && (context === 'unregistered_device' || (context === 'registered_empty_device') !== (entryPolicy === 'blocking'))) ||
    typeof value.operationId !== 'string' || !value.operationId.trim()) return undefined;
  const input = parseEditableInput(value.editableInput);
  if (!input || !validDraft(value.draft, input, value.operationId)) return undefined;
  if (!ONBOARDING_STEPS.includes(value.step as OnboardingStep) || !Array.isArray(value.history) ||
    !value.history.every(step => ONBOARDING_STEPS.includes(step as OnboardingStep))) return undefined;
  if (!Array.isArray(value.completedActions) || !value.completedActions.every(string) ||
    new Set(value.completedActions).size !== value.completedActions.length ||
    value.completedActions.some(key => !/^(welcome|currency|now|next|protect|reserve|clarity):(continue|complete|defer)$/.test(key))) return undefined;
  if (value.repairReturnStep !== undefined && !ONBOARDING_STEPS.includes(value.repairReturnStep as OnboardingStep)) return undefined;
  let publication: CashClaritySetupDraft['publication'];
  if (value.publication !== undefined) {
    if (!record(value.publication) || !onlyKeys(value.publication, ['workplaceId', 'status']) || value.publication.workplaceId !== value.operationId ||
      !['published', 'already_published'].includes(String(value.publication.status))) return undefined;
    publication = { workplaceId: asWorkplaceId(value.publication.workplaceId as string), status: value.publication.status as 'published' | 'already_published' };
  }
  const errorCodes = ['invalid_input', 'missing_spendable_account', 'ambiguous_existing_publication', 'incomplete_publication', 'finalization_failed', 'save_failed'];
  if (value.publicationErrorCode !== undefined && !errorCodes.includes(String(value.publicationErrorCode))) return undefined;
  let legacyProvenance: CashClaritySetupDraft['legacyProvenance'];
  if (value.legacyProvenance !== undefined) {
    if (!record(value.legacyProvenance) || !onlyKeys(value.legacyProvenance, ['name', 'icon', 'currency']) || !FACT_SOURCES.includes(value.legacyProvenance.name as SetupFactSource) ||
      !FACT_SOURCES.includes(value.legacyProvenance.icon as SetupFactSource) ||
      !FACT_SOURCES.includes(value.legacyProvenance.currency as SetupFactSource)) return undefined;
    legacyProvenance = value.legacyProvenance as CashClaritySetupDraft['legacyProvenance'];
  }
  return {
    schemaVersion: CASH_CLARITY_SETUP_SCHEMA_VERSION,
    kind: 'cash_clarity',
    journeyId: journeyId as 'first_run' | 'add_workplace',
    intent: intent as CreationIntent,
    context: context as CreationContext,
    entryPolicy: entryPolicy as SetupEntryPolicy,
    operationId: asWorkplaceId(value.operationId),
    draft: reconstructNumericPlaceholders(value.draft as CashClarityDraft),
    editableInput: input,
    inputLocale: value.inputLocale,
    step: value.step as OnboardingStep,
    history: value.history as OnboardingStep[],
    completedActions: value.completedActions,
    ...(value.repairReturnStep ? { repairReturnStep: value.repairReturnStep as OnboardingStep } : {}),
    ...(publication ? { publication } : {}),
    ...(value.publicationErrorCode ? { publicationErrorCode: value.publicationErrorCode as CashClaritySetupDraft['publicationErrorCode'] } : {}),
    ...(legacyProvenance ? { legacyProvenance } : {}),
  };
}

function reconstructNumericPlaceholders(draft: CashClarityDraft): CashClarityDraft {
  return {
    ...draft,
    accounts: draft.accounts.map(account => ({
      ...account,
      balance: account.balance ?? 0,
    })),
    income: draft.income.kind === 'recurring' ? { ...draft.income, items: draft.income.items.map(item => ({ ...item, amount: item.amount ?? 0 })) } : draft.income,
    commitment: draft.commitment.kind === 'payment' ? { ...draft.commitment, items: draft.commitment.items.map(item => ({ ...item, amount: item.amount ?? 0 })) } : draft.commitment,
    budget: draft.budget.kind === 'set' ? { ...draft.budget, items: draft.budget.items.map(item => ({ ...item, amount: item.amount ?? 0 })) } : draft.budget,
  };
}

/** Remove derived numbers wherever raw editor text is persisted; the parser restores placeholders. */
export function serializeCashClaritySetupDraft(session: CashClaritySetupDraft): string {
  const input = session.editableInput;
  const draft = session.draft;
  const persistedDraft = {
    ...draft,
    accounts: draft.accounts.map(account => {
      const next: Record<string, unknown> = { ...account };
      if (validAmountKey(input, account.id)) delete next.balance;
      if (account.kind === 'card' && validAmountKey(input, `${account.id}:card-payment`)) delete next.cardPaymentAmount;
      return next;
    }),
    income: draft.income.kind === 'recurring' ? { ...draft.income, items: draft.income.items.map(item => {
      const next: Record<string, unknown> = { ...item };
      if (validAmountKey(input, item.id)) delete next.amount;
      return next;
    }) } : draft.income,
    commitment: draft.commitment.kind === 'payment' ? { ...draft.commitment, items: draft.commitment.items.map(item => {
      const next: Record<string, unknown> = { ...item };
      if (validAmountKey(input, item.id)) delete next.amount;
      return next;
    }) } : draft.commitment,
    budget: draft.budget.kind === 'set' ? { ...draft.budget, items: draft.budget.items.map(item => {
      const next: Record<string, unknown> = { ...item };
      if (validAmountKey(input, item.id)) delete next.amount;
      return next;
    }) } : draft.budget,
  };
  return JSON.stringify({ ...session, draft: persistedDraft });
}

export function createCreationSession(options: {
  readonly intent: CreationIntent;
  readonly context: CreationContext;
  readonly entryPolicy: SetupEntryPolicy;
  readonly currency: string;
  readonly workplaceName: string;
  readonly displayName?: string;
  readonly inputLocale?: string;
  readonly operationId?: WorkplaceId;
}): CashClaritySetupDraft {
  const operationId = options.operationId ?? cashClarityWorkplaceId();
  const draft: CashClarityDraft = {
    operationId,
    displayName: options.displayName ?? '',
    workplaceName: options.workplaceName,
    workplaceIcon: Icon.Home,
    currency: options.currency,
    accounts: [],
    income: { kind: 'unset' },
    commitment: { kind: 'unset' },
    budget: { kind: 'unset' },
  };
  return {
    schemaVersion: CASH_CLARITY_SETUP_SCHEMA_VERSION,
    kind: 'cash_clarity',
    journeyId: options.intent === 'first_run' ? 'first_run' : 'add_workplace',
    intent: options.intent,
    context: options.context,
    entryPolicy: options.entryPolicy,
    operationId,
    draft,
    editableInput: { amountTextById: {} },
    inputLocale: options.inputLocale ?? getLocales()[0]?.languageTag ?? 'en-US',
    step: options.intent === 'first_run' ? 'welcome' : 'currency',
    history: [],
    completedActions: [],
  };
}
