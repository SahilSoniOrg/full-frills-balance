import { AccountType } from '@/src/types/enums';
import type { FontId, ThemeId } from '@/src/constants/design-tokens';
import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import { asAccountId, asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import type { WorkplacePreferences } from '@/src/utils/preferences/workplaceTypes';
import { storage } from '@/src/utils/storage';
import type {
  AppearanceSetupOutput,
  DeviceSetupOutput,
  FirstRunSetupDraft,
  RestoreDraftState,
  RestoreFacts,
  RestoreHandoff,
  RestoreSetupDraft,
  RestoreSourceOutput,
  RestoreSourceRef,
  RestoreStats,
  RestoreSummaryOutput,
  SetupDraft,
  SetupDraftBase,
  SetupSummaryOutput,
  SetupSliceId,
  Sourced,
  StarterAccountInput,
  WorkplaceCheckpoint,
  WorkplaceCreationSetupDraft,
  WorkplaceSetupOutput,
} from './setupTypes';
import {
  isAccountType,
  isFontId,
  isRestoreJourneyId,
  isSetupFactSource,
  isSetupJourneyId,
  isSetupSliceId,
  isThemeId,
  isWorkplaceId,
} from './setupTypes';

export const SETUP_DRAFT_KEY = 'setup_draft_v1';
export const SETUP_DRAFT_SCHEMA_VERSION = 1 as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value) ? value : undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseSourced<T>(
  value: unknown,
  parseValue: (value: unknown) => T | undefined,
): Sourced<T> | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['value', 'source']) ||
    !isSetupFactSource(value.source)
  ) {
    return undefined;
  }
  const parsedValue = parseValue(value.value);
  return parsedValue === undefined ? undefined : { value: parsedValue, source: value.source };
}

function parseNonEmptySourcedString(value: unknown): Sourced<string> | undefined {
  return parseSourced(value, candidate => (nonEmptyString(candidate) ? candidate : undefined));
}

function parseIcon(value: unknown): IconName | undefined {
  return typeof value === 'string' && isValidIconName(value) ? value : undefined;
}

function parseTheme(value: unknown): ThemeId | undefined {
  return isThemeId(value) ? value : undefined;
}

function parseFont(value: unknown): FontId | undefined {
  return isFontId(value) ? value : undefined;
}

function parseStarter(value: unknown): StarterAccountInput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'type', 'icon'])) return undefined;
  const icon = parseIcon(value.icon);
  if (!nonEmptyString(value.name) || !isAccountType(value.type) || !icon) return undefined;
  return { name: value.name, type: value.type, icon };
}

function parseStarterArray(
  value: unknown,
  category: boolean,
): readonly StarterAccountInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(parseStarter);
  if (items.some(item => item === undefined)) return undefined;
  if (
    category &&
    items.some(item => item?.type !== AccountType.INCOME && item?.type !== AccountType.EXPENSE)
  ) {
    return undefined;
  }
  return items as StarterAccountInput[];
}

function parseSourcedIcon(value: unknown): Sourced<IconName> | undefined {
  return parseSourced(value, parseIcon);
}

function parseSourcedCurrency(value: unknown): Sourced<string> | undefined {
  return parseNonEmptySourcedString(value);
}

function parseAppearance(value: unknown): AppearanceSetupOutput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['themeId', 'fontId'])) return undefined;
  const themeId = parseSourced(value.themeId, parseTheme);
  const fontId = parseSourced(value.fontId, parseFont);
  return themeId && fontId ? { themeId, fontId } : undefined;
}

const CHECKPOINTS: readonly WorkplaceCheckpoint[] = [
  'identity',
  'currency',
  'accounts',
  'categories',
];

function parseCheckpointArray(value: unknown): readonly WorkplaceCheckpoint[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every(item => CHECKPOINTS.includes(item as WorkplaceCheckpoint))
  ) {
    return undefined;
  }
  const checkpoints = value as WorkplaceCheckpoint[];
  return new Set(checkpoints).size === checkpoints.length ? checkpoints : undefined;
}

function parseWorkplace(value: unknown): WorkplaceSetupOutput | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'name',
      'icon',
      'baseCurrency',
      'selectedAccounts',
      'selectedCategories',
      'acceptedCheckpoints',
    ])
  ) {
    return undefined;
  }
  const name = parseNonEmptySourcedString(value.name);
  const icon = parseSourcedIcon(value.icon);
  const baseCurrency = parseSourcedCurrency(value.baseCurrency);
  const selectedAccounts = parseStarterArray(value.selectedAccounts, false);
  const selectedCategories = parseStarterArray(value.selectedCategories, true);
  const acceptedCheckpoints = parseCheckpointArray(value.acceptedCheckpoints);
  return name &&
    icon &&
    baseCurrency &&
    selectedAccounts &&
    selectedCategories &&
    acceptedCheckpoints
    ? { name, icon, baseCurrency, selectedAccounts, selectedCategories, acceptedCheckpoints }
    : undefined;
}

function parseSourceRef(value: unknown): RestoreSourceRef | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['uri', 'name', 'size', 'fingerprint']))
    return undefined;
  if (
    !nonEmptyString(value.uri) ||
    !nonEmptyString(value.name) ||
    !nonEmptyString(value.fingerprint)
  ) {
    return undefined;
  }
  if (value.size !== undefined && !isNonNegativeInteger(value.size)) return undefined;
  return {
    uri: value.uri,
    name: value.name,
    ...(value.size === undefined ? {} : { size: value.size }),
    fingerprint: value.fingerprint,
  };
}

function parseFacts(value: unknown): RestoreFacts | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['user', 'workplace', 'appearance', 'workplacePreferences']) ||
    !isRecord(value.workplace) ||
    !hasOnlyKeys(value.workplace, ['name', 'icon', 'defaultCurrencyCode'])
  ) {
    return undefined;
  }
  const workplaceName = optionalNonEmptyString(value.workplace.name);
  const workplaceIcon = optionalNonEmptyString(value.workplace.icon);
  const baseCurrency = optionalNonEmptyString(value.workplace.defaultCurrencyCode);
  if (
    (value.workplace.name !== undefined && !workplaceName) ||
    (value.workplace.icon !== undefined && !workplaceIcon) ||
    (value.workplace.defaultCurrencyCode !== undefined && !baseCurrency)
  ) {
    return undefined;
  }

  let user: RestoreFacts['user'];
  if (value.user !== undefined) {
    if (!isRecord(value.user) || !hasOnlyKeys(value.user, ['name'])) return undefined;
    const name = optionalNonEmptyString(value.user.name);
    if (value.user.name !== undefined && !name) return undefined;
    user = name === undefined ? {} : { name };
  }

  let appearance: RestoreFacts['appearance'];
  if (value.appearance !== undefined) {
    if (
      !isRecord(value.appearance) ||
      !hasOnlyKeys(value.appearance, ['theme', 'themeId', 'fontId'])
    )
      return undefined;
    const theme =
      value.appearance.theme === undefined
        ? undefined
        : parseThemeAppearance(value.appearance.theme);
    const themeId =
      value.appearance.themeId === undefined ? undefined : parseTheme(value.appearance.themeId);
    const fontId =
      value.appearance.fontId === undefined ? undefined : parseFont(value.appearance.fontId);
    if (
      (value.appearance.theme !== undefined && !theme) ||
      (value.appearance.themeId !== undefined && !themeId) ||
      (value.appearance.fontId !== undefined && !fontId)
    )
      return undefined;
    appearance = {
      ...(theme === undefined ? {} : { theme }),
      ...(themeId === undefined ? {} : { themeId }),
      ...(fontId === undefined ? {} : { fontId }),
    };
  }

  const workplacePreferences =
    value.workplacePreferences === undefined
      ? undefined
      : parseWorkplacePreferences(value.workplacePreferences);
  if (value.workplacePreferences !== undefined && !workplacePreferences) return undefined;

  return {
    ...(user === undefined ? {} : { user }),
    workplace: {
      ...(workplaceName === undefined ? {} : { name: workplaceName }),
      ...(workplaceIcon === undefined ? {} : { icon: workplaceIcon }),
      ...(baseCurrency === undefined ? {} : { defaultCurrencyCode: baseCurrency }),
    },
    ...(appearance === undefined ? {} : { appearance }),
    ...(workplacePreferences === undefined ? {} : { workplacePreferences }),
  };
}

function parseThemeAppearance(value: unknown): 'light' | 'dark' | 'system' | undefined {
  return value === 'light' || value === 'dark' || value === 'system' ? value : undefined;
}

function parseWorkplacePreferences(value: unknown): Partial<WorkplacePreferences> | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'lastSelectedAccountId',
      'lastDateRange',
      'lastUsedSourceAccountId',
      'lastUsedDestinationAccountId',
      'dismissedPatternIds',
      'safeToSpendDays',
    ])
  )
    return undefined;
  if (value.lastDateRange !== undefined) {
    if (
      !isRecord(value.lastDateRange) ||
      !hasOnlyKeys(value.lastDateRange, ['startDate', 'endDate']) ||
      typeof value.lastDateRange.startDate !== 'number' ||
      typeof value.lastDateRange.endDate !== 'number'
    )
      return undefined;
  }
  for (const key of [
    'lastSelectedAccountId',
    'lastUsedSourceAccountId',
    'lastUsedDestinationAccountId',
  ] as const) {
    if (value[key] !== undefined && !nonEmptyString(value[key])) return undefined;
  }
  if (
    value.dismissedPatternIds !== undefined &&
    (!Array.isArray(value.dismissedPatternIds) ||
      !value.dismissedPatternIds.every(item => typeof item === 'string'))
  )
    return undefined;
  if (value.safeToSpendDays !== undefined && !isNonNegativeInteger(value.safeToSpendDays))
    return undefined;
  return {
    ...(value.lastSelectedAccountId === undefined
      ? {}
      : { lastSelectedAccountId: asAccountId(value.lastSelectedAccountId as string) }),
    ...(value.lastDateRange === undefined
      ? {}
      : { lastDateRange: value.lastDateRange as { startDate: number; endDate: number } }),
    ...(value.lastUsedSourceAccountId === undefined
      ? {}
      : { lastUsedSourceAccountId: asAccountId(value.lastUsedSourceAccountId as string) }),
    ...(value.lastUsedDestinationAccountId === undefined
      ? {}
      : {
          lastUsedDestinationAccountId: asAccountId(value.lastUsedDestinationAccountId as string),
        }),
    ...(value.dismissedPatternIds === undefined
      ? {}
      : { dismissedPatternIds: value.dismissedPatternIds as string[] }),
    ...(value.safeToSpendDays === undefined ? {} : { safeToSpendDays: value.safeToSpendDays }),
  };
}

function parseStats(value: unknown): RestoreStats | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'workplaceId',
      'accounts',
      'journals',
      'transactions',
      'budgets',
      'auditLogs',
      'plannedPayments',
      'skippedTransactions',
      'skippedItems',
      'preImportBackupPath',
    ]) ||
    !isNonNegativeInteger(value.accounts) ||
    !isNonNegativeInteger(value.journals) ||
    !isNonNegativeInteger(value.transactions) ||
    !isNonNegativeInteger(value.skippedTransactions)
  ) {
    return undefined;
  }
  if (value.workplaceId !== undefined && !nonEmptyString(value.workplaceId)) return undefined;
  if (value.budgets !== undefined && !isNonNegativeInteger(value.budgets)) return undefined;
  if (value.auditLogs !== undefined && !isNonNegativeInteger(value.auditLogs)) return undefined;
  if (value.plannedPayments !== undefined && !isNonNegativeInteger(value.plannedPayments))
    return undefined;
  if (value.preImportBackupPath !== undefined && !nonEmptyString(value.preImportBackupPath))
    return undefined;
  if (
    value.skippedItems !== undefined &&
    (!Array.isArray(value.skippedItems) ||
      !value.skippedItems.every(
        item =>
          isRecord(item) &&
          hasOnlyKeys(item, ['id', 'reason', 'description']) &&
          nonEmptyString(item.id) &&
          nonEmptyString(item.reason) &&
          (item.description === undefined || typeof item.description === 'string'),
      ))
  )
    return undefined;
  return {
    ...(value.workplaceId === undefined ? {} : { workplaceId: value.workplaceId }),
    accounts: value.accounts,
    journals: value.journals,
    transactions: value.transactions,
    skippedTransactions: value.skippedTransactions,
    ...(value.budgets === undefined ? {} : { budgets: value.budgets }),
    ...(value.auditLogs === undefined ? {} : { auditLogs: value.auditLogs }),
    ...(value.plannedPayments === undefined ? {} : { plannedPayments: value.plannedPayments }),
    ...(value.skippedItems === undefined ? {} : { skippedItems: value.skippedItems }),
    ...(value.preImportBackupPath === undefined
      ? {}
      : { preImportBackupPath: value.preImportBackupPath }),
  };
}

function parseHandoff(value: unknown, operationId: WorkplaceId): RestoreHandoff | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['operationId', 'workplaceId', 'fingerprint', 'facts', 'stats', 'warnings'])
  ) {
    return undefined;
  }
  if (
    !isWorkplaceId(value.operationId) ||
    !isWorkplaceId(value.workplaceId) ||
    !nonEmptyString(value.fingerprint)
  )
    return undefined;
  if (value.operationId !== operationId) return undefined;
  const facts = parseFacts(value.facts);
  const stats = parseStats(value.stats);
  if (
    !facts ||
    !stats ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(item => typeof item === 'string')
  ) {
    return undefined;
  }
  return {
    operationId: asWorkplaceId(value.operationId),
    workplaceId: asWorkplaceId(value.workplaceId),
    fingerprint: value.fingerprint,
    facts,
    stats,
    warnings: value.warnings,
  };
}

function parseRestoreSource(value: unknown): RestoreSourceOutput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['source', 'facts'])) return undefined;
  const source = parseSourceRef(value.source);
  const facts = parseFacts(value.facts);
  return source && facts ? { source, facts } : undefined;
}

function parseDevice(value: unknown): DeviceSetupOutput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['displayName'])) return undefined;
  const displayName = parseNonEmptySourcedString(value.displayName);
  return displayName ? { displayName } : undefined;
}

function parseRestoreSummary(value: unknown): RestoreSummaryOutput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['intent'])) return undefined;
  const intents = ['continue', 'open', 'stay', 'return_to_picker', 'discard'] as const;
  return intents.includes(value.intent as (typeof intents)[number])
    ? { intent: value.intent as RestoreSummaryOutput['intent'] }
    : undefined;
}

function parseSummary(value: unknown): SetupSummaryOutput | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['confirmed']) || value.confirmed !== true)
    return undefined;
  return { confirmed: true };
}

function parseBase(value: RecordValue): SetupDraftBase | undefined {
  if (
    value.schemaVersion !== SETUP_DRAFT_SCHEMA_VERSION ||
    !isWorkplaceId(value.operationId) ||
    !Array.isArray(value.presentedHistory) ||
    !Array.isArray(value.acceptedSlices) ||
    !value.presentedHistory.every(isSetupSliceId) ||
    !value.acceptedSlices.every(isSetupSliceId)
  ) {
    return undefined;
  }
  const presentedHistory = value.presentedHistory as SetupSliceId[];
  const acceptedSlices = value.acceptedSlices as SetupSliceId[];
  if (
    new Set(presentedHistory).size !== presentedHistory.length ||
    new Set(acceptedSlices).size !== acceptedSlices.length
  ) {
    return undefined;
  }
  if (value.activeSlice !== undefined && !isSetupSliceId(value.activeSlice)) return undefined;
  if (value.editingSlice !== undefined && !isSetupSliceId(value.editingSlice)) return undefined;
  return {
    schemaVersion: SETUP_DRAFT_SCHEMA_VERSION,
    operationId: asWorkplaceId(value.operationId),
    presentedHistory,
    acceptedSlices,
    ...(value.activeSlice === undefined ? {} : { activeSlice: value.activeSlice }),
    ...(value.editingSlice === undefined ? {} : { editingSlice: value.editingSlice }),
  };
}

function acceptedOutputIsPresent(draft: SetupDraft): boolean {
  const accepted = new Set(draft.acceptedSlices);
  if (draft.kind !== 'workplace_creation') {
    if (accepted.has('device') && !draft.device) return false;
    if (accepted.has('appearance') && !draft.appearance) return false;
  }
  if (accepted.has('workplace') && !draft.workplace) return false;
  if (accepted.has('summary') && !draft.summary) return false;
  if (draft.kind === 'restore') {
    if (accepted.has('restore_source') && !draft.restore.source) return false;
    if (accepted.has('restore_summary') && !draft.restore.summary) return false;
  }
  return true;
}

function parseFirstRun(value: RecordValue, base: SetupDraftBase): FirstRunSetupDraft | undefined {
  const allowed = [
    'schemaVersion',
    'kind',
    'journeyId',
    'entryPolicy',
    'operationId',
    'presentedHistory',
    'acceptedSlices',
    'activeSlice',
    'editingSlice',
    'device',
    'workplace',
    'appearance',
    'summary',
  ];
  if (
    !hasOnlyKeys(value, allowed) ||
    value.kind !== 'first_run' ||
    value.journeyId !== 'first_run' ||
    value.entryPolicy !== 'blocking'
  ) {
    return undefined;
  }
  const device = value.device === undefined ? undefined : parseDevice(value.device);
  const workplace = value.workplace === undefined ? undefined : parseWorkplace(value.workplace);
  const appearance = value.appearance === undefined ? undefined : parseAppearance(value.appearance);
  const summary = value.summary === undefined ? undefined : parseSummary(value.summary);
  if (
    (value.device !== undefined && !device) ||
    (value.workplace !== undefined && !workplace) ||
    (value.appearance !== undefined && !appearance) ||
    (value.summary !== undefined && !summary)
  ) {
    return undefined;
  }
  const draft: FirstRunSetupDraft = {
    ...base,
    kind: 'first_run',
    journeyId: 'first_run',
    entryPolicy: 'blocking',
    ...(device ? { device } : {}),
    ...(workplace ? { workplace } : {}),
    ...(appearance ? { appearance } : {}),
    ...(summary ? { summary } : {}),
  };
  return acceptedOutputIsPresent(draft) ? draft : undefined;
}

function parseRestore(value: RecordValue, base: SetupDraftBase): RestoreSetupDraft | undefined {
  const allowed = [
    'schemaVersion',
    'kind',
    'journeyId',
    'entryPolicy',
    'operationId',
    'presentedHistory',
    'acceptedSlices',
    'activeSlice',
    'editingSlice',
    'restore',
    'device',
    'workplace',
    'appearance',
    'summary',
  ];
  if (
    !hasOnlyKeys(value, allowed) ||
    value.kind !== 'restore' ||
    !isRestoreJourneyId(value.journeyId) ||
    (value.entryPolicy !== 'blocking' && value.entryPolicy !== 'optional') ||
    !isRecord(value.restore) ||
    !hasOnlyKeys(value.restore, ['source', 'handoff', 'summary'])
  ) {
    return undefined;
  }
  const source =
    value.restore.source === undefined ? undefined : parseRestoreSource(value.restore.source);
  const handoff =
    value.restore.handoff === undefined
      ? undefined
      : parseHandoff(value.restore.handoff, base.operationId);
  const restoreSummary =
    value.restore.summary === undefined ? undefined : parseRestoreSummary(value.restore.summary);
  const device = value.device === undefined ? undefined : parseDevice(value.device);
  const workplace = value.workplace === undefined ? undefined : parseWorkplace(value.workplace);
  const appearance = value.appearance === undefined ? undefined : parseAppearance(value.appearance);
  const summary = value.summary === undefined ? undefined : parseSummary(value.summary);
  if (
    (value.restore.source !== undefined && !source) ||
    (value.restore.handoff !== undefined && !handoff) ||
    (value.restore.summary !== undefined && !restoreSummary) ||
    (value.device !== undefined && !device) ||
    (value.workplace !== undefined && !workplace) ||
    (value.appearance !== undefined && !appearance) ||
    (value.summary !== undefined && !summary)
  ) {
    return undefined;
  }
  const restore: RestoreDraftState = {
    ...(source ? { source } : {}),
    ...(handoff ? { handoff } : {}),
    ...(restoreSummary ? { summary: restoreSummary } : {}),
  };
  const draft: RestoreSetupDraft = {
    ...base,
    kind: 'restore',
    journeyId: value.journeyId,
    entryPolicy: value.entryPolicy as 'blocking' | 'optional',
    restore,
    ...(device ? { device } : {}),
    ...(workplace ? { workplace } : {}),
    ...(appearance ? { appearance } : {}),
    ...(summary ? { summary } : {}),
  };
  if (value.journeyId === 'picker_restore' || value.journeyId === 'settings_restore') {
    if (device || appearance || summary) return undefined;
  }
  if (value.journeyId === 'first_run_restore' && value.entryPolicy !== 'blocking') return undefined;
  if (value.journeyId === 'empty_device_restore' && value.entryPolicy !== 'blocking')
    return undefined;
  if (value.journeyId === 'settings_restore' && value.entryPolicy !== 'optional') return undefined;
  return acceptedOutputIsPresent(draft) ? draft : undefined;
}

function parseWorkplaceCreation(
  value: RecordValue,
  base: SetupDraftBase,
): WorkplaceCreationSetupDraft | undefined {
  const allowed = [
    'schemaVersion',
    'kind',
    'journeyId',
    'entryPolicy',
    'operationId',
    'presentedHistory',
    'acceptedSlices',
    'activeSlice',
    'editingSlice',
    'workplace',
    'summary',
  ];
  if (
    !hasOnlyKeys(value, allowed) ||
    value.kind !== 'workplace_creation' ||
    (value.journeyId !== 'empty_device_workplace' && value.journeyId !== 'create_workplace') ||
    (value.journeyId === 'empty_device_workplace' && value.entryPolicy !== 'blocking') ||
    (value.journeyId === 'create_workplace' && value.entryPolicy !== 'optional')
  ) {
    return undefined;
  }
  const workplace = value.workplace === undefined ? undefined : parseWorkplace(value.workplace);
  const summary = value.summary === undefined ? undefined : parseSummary(value.summary);
  if ((value.workplace !== undefined && !workplace) || (value.summary !== undefined && !summary))
    return undefined;
  const draft: WorkplaceCreationSetupDraft = {
    ...base,
    kind: 'workplace_creation',
    journeyId: value.journeyId,
    entryPolicy: value.entryPolicy as 'blocking' | 'optional',
    ...(workplace ? { workplace } : {}),
    ...(summary ? { summary } : {}),
  };
  return acceptedOutputIsPresent(draft) ? draft : undefined;
}

/** Strict parser for the single device-local Setup draft. Invalid drafts are discarded. */
export function parseSetupDraft(value: unknown): SetupDraft | undefined {
  if (!isRecord(value)) return undefined;
  const base = parseBase(value);
  if (
    !base ||
    !isSetupJourneyId(value.journeyId) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'kind',
      'journeyId',
      'entryPolicy',
      'operationId',
      'presentedHistory',
      'acceptedSlices',
      'activeSlice',
      'editingSlice',
      'device',
      'workplace',
      'appearance',
      'summary',
      'restore',
    ])
  ) {
    return undefined;
  }
  if (value.kind === 'first_run') return parseFirstRun(value, base);
  if (value.kind === 'restore') return parseRestore(value, base);
  if (value.kind === 'workplace_creation') return parseWorkplaceCreation(value, base);
  return undefined;
}

export function isValidSetupDraft(value: unknown): value is SetupDraft {
  return parseSetupDraft(value) !== undefined;
}

export class SetupDraftStore {
  load(): SetupDraft | undefined {
    try {
      const raw = storage.getString(SETUP_DRAFT_KEY);
      if (!raw) return undefined;
      return parseSetupDraft(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }

  save(draft: SetupDraft): void {
    if (!isValidSetupDraft(draft)) throw new Error('Cannot persist an invalid Setup draft');
    storage.set(SETUP_DRAFT_KEY, JSON.stringify(draft));
  }

  clear(): void {
    storage.remove(SETUP_DRAFT_KEY);
  }
}

export const setupDraftStore = new SetupDraftStore();

export function loadSetupDraft(): SetupDraft | undefined {
  return setupDraftStore.load();
}

export function saveSetupDraft(draft: SetupDraft): void {
  setupDraftStore.save(draft);
}

export function clearSetupDraft(): void {
  setupDraftStore.clear();
}
