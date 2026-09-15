import { FontIds, ThemeIds, type FontId, type ThemeId } from '@/src/constants/design-tokens';
import { AccountType } from '@/src/types/enums';
import { type IconName } from '@/src/types/domainIcons';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type {
  RestoreFacts as ImportedRestoreFacts,
  RestoreHandoff as ImportedRestoreHandoff,
} from '@/src/services/import/restore';
import type { ImportStats } from '@/src/services/import/types';

export { isSetupJourneyId, type SetupJourneyId } from '@/src/services/setup/setupDraftIdentity';

export type RestoreJourneyId =
  'first_run_restore' | 'empty_device_restore' | 'picker_restore' | 'settings_restore';

export type SetupEntryPolicy = 'blocking' | 'optional';
export type SetupSliceId =
  'device' | 'restore_source' | 'workplace' | 'restore_summary' | 'appearance' | 'summary';
export type SetupSlicePolicy = 'required' | 'when_missing' | 'always_show';
export type SetupEffectId = 'publish_restore';

export type SetupFactSource = 'user_entered' | 'imported' | 'existing' | 'defaulted';

export interface Sourced<T> {
  readonly value: T;
  readonly source: SetupFactSource;
}

export interface StarterAccountInput {
  /** Optional stable ID for flows that need to reference the freshly-created account. */
  readonly id?: AccountId;
  readonly name: string;
  readonly type: AccountType;
  readonly icon: IconName;
}

export type StarterCategoryInput = StarterAccountInput;

export type WorkplaceCheckpoint = 'identity' | 'currency' | 'accounts' | 'categories';

export interface DeviceSetupOutput {
  readonly displayName: Sourced<string>;
}

export interface WorkplaceSetupOutput {
  readonly name: Sourced<string>;
  readonly icon: Sourced<IconName>;
  readonly baseCurrency: Sourced<string>;
  readonly selectedAccounts: readonly StarterAccountInput[];
  readonly selectedCategories: readonly StarterCategoryInput[];
  readonly acceptedCheckpoints: readonly WorkplaceCheckpoint[];
}

/** Imported facts that can prefill Workplace setup without auto-completing it. */
export type WorkplaceSetupPrefill = {
  readonly name?: Sourced<string>;
  readonly icon?: Sourced<IconName>;
  readonly baseCurrency?: Sourced<string>;
};

export interface AppearanceSetupOutput {
  readonly themeId: Sourced<ThemeId>;
  readonly fontId: Sourced<FontId>;
}

export interface RestoreSourceRef {
  readonly uri: string;
  readonly name: string;
  readonly size?: number;
  readonly fingerprint: string;
  readonly workplaceIndex?: number;
}

/** Import owns the restore facts/handoff shape; Setup only stores the typed seam. */
export type RestoreFacts = ImportedRestoreFacts;
export type RestoreHandoff = ImportedRestoreHandoff;
export type RestoreStats = ImportStats;

export interface RestoreSourceOutput {
  readonly source: RestoreSourceRef;
  readonly facts: RestoreFacts;
  /** Present on newly prepared sources; omitted by legacy persisted drafts. */
  readonly stats?: RestoreStats;
  readonly warnings?: readonly string[];
  readonly operationId?: WorkplaceId;
}

export type RestoreSummaryIntent = 'continue' | 'open' | 'stay' | 'return_to_picker' | 'discard';

export interface RestoreSummaryOutput {
  readonly intent: RestoreSummaryIntent;
}

export interface SetupSummaryOutput {
  readonly confirmed: true;
}

export interface SetupDraftBase {
  readonly schemaVersion: 1;
  readonly operationId: WorkplaceId;
  readonly presentedHistory: readonly SetupSliceId[];
  readonly acceptedSlices: readonly SetupSliceId[];
  /** Set only for Back or Summary > Change; never a numeric progress cursor. */
  readonly activeSlice?: SetupSliceId;
}

export interface FirstRunSetupDraft extends SetupDraftBase {
  readonly kind: 'first_run';
  readonly journeyId: 'first_run';
  readonly entryPolicy: 'blocking';
  readonly device?: DeviceSetupOutput;
  readonly workplace?: WorkplaceSetupOutput;
  readonly appearance?: AppearanceSetupOutput;
  readonly summary?: SetupSummaryOutput;
}

export interface RestoreDraftState {
  /** Selected workplaces, primary first. */
  readonly sources?: readonly RestoreSourceOutput[];
  /** Publication results aligned with `sources`, primary first. */
  readonly handoffs?: readonly RestoreHandoff[];
  readonly summary?: RestoreSummaryOutput;
  readonly deviceCandidate?: Sourced<string>;
}

export interface RestoreSetupDraft extends SetupDraftBase {
  readonly kind: 'restore';
  readonly journeyId: RestoreJourneyId;
  readonly entryPolicy: SetupEntryPolicy;
  readonly restore: RestoreDraftState;
  readonly device?: DeviceSetupOutput;
  readonly workplace?: WorkplaceSetupOutput;
  readonly appearance?: AppearanceSetupOutput;
  readonly summary?: SetupSummaryOutput;
}

export interface WorkplaceCreationSetupDraft extends SetupDraftBase {
  readonly kind: 'workplace_creation';
  readonly journeyId: 'empty_device_workplace' | 'create_workplace';
  readonly entryPolicy: 'optional' | 'blocking';
  readonly workplace?: WorkplaceSetupOutput;
  readonly summary?: SetupSummaryOutput;
}

/** Explicit union: adding a slice adds a field here, not a string-keyed output map. */
export type SetupDraft = FirstRunSetupDraft | RestoreSetupDraft | WorkplaceCreationSetupDraft;

export type SetupSliceOutput =
  | DeviceSetupOutput
  | WorkplaceSetupOutput
  | AppearanceSetupOutput
  | readonly RestoreSourceOutput[]
  | RestoreSummaryOutput
  | SetupSummaryOutput;

export interface SetupSliceOutputById {
  readonly device: DeviceSetupOutput;
  readonly restore_source: readonly RestoreSourceOutput[];
  readonly workplace: WorkplaceSetupOutput;
  readonly restore_summary: RestoreSummaryOutput;
  readonly appearance: AppearanceSetupOutput;
  readonly summary: SetupSummaryOutput;
}

export type SetupSliceAcceptance = {
  [K in SetupSliceId]: { readonly sliceId: K; readonly output: SetupSliceOutputById[K] };
}[SetupSliceId];

export type SetupAutoAcceptAction = {
  [K in SetupSliceId]: {
    readonly kind: 'auto_accept';
    readonly sliceId: K;
    readonly output: SetupSliceOutputById[K];
  };
}[SetupSliceId];

export interface SetupProgress {
  readonly current: number;
  readonly total: number;
  readonly completed: number;
}

export type SetupOutcome =
  | { readonly kind: 'device_registered' }
  | { readonly kind: 'workplace_created'; readonly workplaceId: WorkplaceId }
  | {
      readonly kind: 'restore_accepted';
      readonly workplaceId: WorkplaceId;
      readonly next: 'open' | 'stay' | 'picker';
    }
  | { readonly kind: 'journey_discarded' };

export function isRestoreJourneyId(value: unknown): value is RestoreJourneyId {
  return (
    value === 'first_run_restore' ||
    value === 'empty_device_restore' ||
    value === 'picker_restore' ||
    value === 'settings_restore'
  );
}

export function isSetupSliceId(value: unknown): value is SetupSliceId {
  return (
    value === 'device' ||
    value === 'restore_source' ||
    value === 'workplace' ||
    value === 'restore_summary' ||
    value === 'appearance' ||
    value === 'summary'
  );
}

export function isSetupFactSource(value: unknown): value is SetupFactSource {
  return (
    value === 'user_entered' ||
    value === 'imported' ||
    value === 'existing' ||
    value === 'defaulted'
  );
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.values(ThemeIds).includes(value as ThemeId);
}

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && Object.values(FontIds).includes(value as FontId);
}

export function isWorkplaceId(value: unknown): value is WorkplaceId {
  return typeof value === 'string' && value.trim().length > 0;
}

export function restoreSources(draft: RestoreSetupDraft): readonly RestoreSourceOutput[] {
  return draft.restore.sources ?? [];
}

export function primaryRestoreSource(draft: RestoreSetupDraft): RestoreSourceOutput | undefined {
  return draft.restore.sources?.[0];
}

export function sameRestoreSources(
  left: readonly RestoreSourceOutput[] | undefined,
  right: readonly RestoreSourceOutput[] | undefined,
): boolean {
  const previous = left ?? [];
  const next = right ?? [];
  if (previous.length !== next.length) return false;
  return previous.every((item, index) => {
    const other = next[index];
    return (
      other !== undefined &&
      item.source.fingerprint === other.source.fingerprint &&
      item.source.workplaceIndex === other.source.workplaceIndex &&
      item.operationId === other.operationId
    );
  });
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && Object.values(AccountType).includes(value as AccountType);
}
