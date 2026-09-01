import { AccountType } from '@/src/types/enums';
import type { FontId, ThemeId } from '@/src/constants/design-tokens';
import { isValidIconName, type IconName } from '@/src/types/domainIcons';
import { asWorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';
import { notifySetupDraftChanged, SETUP_DRAFT_KEY } from '@/src/services/setup/launchProjection';
import { parseRestoreFacts, parseRestoreHandoff } from '@/src/services/import/parseRestorePayload';
import {
  claimedRestoreFingerprint,
  isRestoreOwnershipTuple,
} from '@/src/services/import/restoreOwnership';
import type {
  AppearanceSetupOutput,
  DeviceSetupOutput,
  FirstRunSetupDraft,
  RestoreDraftState,
  RestoreSetupDraft,
  RestoreSourceOutput,
  RestoreSourceRef,
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

export { SETUP_DRAFT_KEY };
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
  if (
    !isRecord(value) ||
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

function parseRestoreSource(value: unknown): RestoreSourceOutput | undefined {
  if (!isRecord(value)) return undefined;
  const source = parseSourceRef(value.source);
  const facts = parseRestoreFacts(value.facts);
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
  return {
    schemaVersion: SETUP_DRAFT_SCHEMA_VERSION,
    operationId: asWorkplaceId(value.operationId),
    presentedHistory,
    acceptedSlices,
    ...(value.activeSlice === undefined ? {} : { activeSlice: value.activeSlice }),
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
    !hasOnlyKeys(value.restore, ['source', 'handoff', 'summary', 'deviceCandidate'])
  ) {
    return undefined;
  }
  const source =
    value.restore.source === undefined ? undefined : parseRestoreSource(value.restore.source);
  const handoff =
    value.restore.handoff === undefined
      ? undefined
      : parseRestoreHandoff(value.restore.handoff, base.operationId);
  const restoreSummary =
    value.restore.summary === undefined ? undefined : parseRestoreSummary(value.restore.summary);
  const deviceCandidate =
    value.restore.deviceCandidate === undefined
      ? undefined
      : parseNonEmptySourcedString(value.restore.deviceCandidate);
  const device = value.device === undefined ? undefined : parseDevice(value.device);
  const workplace = value.workplace === undefined ? undefined : parseWorkplace(value.workplace);
  const appearance = value.appearance === undefined ? undefined : parseAppearance(value.appearance);
  const summary = value.summary === undefined ? undefined : parseSummary(value.summary);
  if (
    (value.restore.source !== undefined && !source) ||
    (value.restore.handoff !== undefined && !handoff) ||
    (value.restore.summary !== undefined && !restoreSummary) ||
    (value.restore.deviceCandidate !== undefined && !deviceCandidate) ||
    (value.device !== undefined && !device) ||
    (value.workplace !== undefined && !workplace) ||
    (value.appearance !== undefined && !appearance) ||
    (value.summary !== undefined && !summary)
  ) {
    return undefined;
  }
  if (
    !isRestoreOwnershipTuple({
      operationId: base.operationId,
      sourceFingerprint: source?.source.fingerprint,
      handoff,
      claimedFingerprint: claimedRestoreFingerprint(base.operationId),
    })
  ) {
    return undefined;
  }
  const restore: RestoreDraftState = {
    ...(source ? { source } : {}),
    ...(handoff ? { handoff } : {}),
    ...(restoreSummary ? { summary: restoreSummary } : {}),
    ...(deviceCandidate ? { deviceCandidate } : {}),
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
    notifySetupDraftChanged();
  }

  clear(): void {
    storage.remove(SETUP_DRAFT_KEY);
    notifySetupDraftChanged();
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
