import type { SetupRecipe } from './setupRecipes';
import {
  resolveNextSetupAction,
  type NextSetupAction,
  type SetupResolutionDefinitions,
} from './resolveNextSetupAction';
import type {
  DeviceSetupOutput,
  RestoreHandoff,
  RestoreJourneyId,
  RestoreSetupDraft,
  RestoreSourceOutput,
  SetupSliceAcceptance,
  SetupSliceOutputById,
  SetupSliceId,
  SetupSliceOutput,
} from './setupTypes';
import { sameRestoreSources } from './setupTypes';
import { getSetupRecipe, recipeContainsSlice, recipeTerminalSlice } from './setupRecipes';
import { SetupDraftStore, setupDraftStore } from './SetupDraftStore';
import { generator } from '@/src/data/database/idGenerator';
import { asWorkplaceId } from '@/src/types/ids';

type SliceAcceptance = SetupSliceAcceptance;
type RestoreProgress = (message: string, progress?: number) => void;

const SOURCE_DOWNSTREAM: readonly SetupSliceId[] = [
  'workplace',
  'restore_summary',
  'device',
];

type RestoreSetupOutcome =
  | {
      readonly kind: 'restore_accepted';
      readonly workplaceId: RestoreSetupDraft['operationId'];
      readonly next: 'open' | 'stay' | 'picker';
    }
  | { readonly kind: 'journey_discarded' };

export interface SetupCoordinatorOptions {
  readonly journeyId: RestoreJourneyId;
  readonly operationId: RestoreSetupDraft['operationId'];
  readonly recipe?: SetupRecipe;
  readonly draft?: RestoreSetupDraft;
  readonly draftStore?: Pick<SetupDraftStore, 'save' | 'clear'>;
  readonly resolution?: SetupResolutionDefinitions;
  readonly validate?: (
    sliceId: SetupSliceId,
    output: SetupSliceOutput,
    draft: RestoreSetupDraft,
  ) => void | Promise<void>;
  readonly effects?: {
    readonly publishRestore?: (
      draft: RestoreSetupDraft,
      onProgress?: RestoreProgress,
    ) => Promise<readonly RestoreHandoff[]>;
    readonly discardRestorePublication?: (draft: RestoreSetupDraft) => Promise<void>;
    readonly commitDevice?: (output: DeviceSetupOutput) => void;
  };
  readonly finish: (draft: RestoreSetupDraft) => Promise<RestoreSetupOutcome>;
}

export type { SetupSliceOutputById } from './setupTypes';

export type BackResult =
  { readonly kind: 'at_start' } | { readonly kind: 'present'; readonly sliceId: SetupSliceId };

export interface SetupCoordinator {
  readonly getDraft: () => RestoreSetupDraft;
  readonly next: () => NextSetupAction;
  /** Persist one or more authoritative auto-completions, stopping at presentation. */
  readonly advanceAutoAccepted: () => Promise<NextSetupAction>;
  /** Mark that a slice actually rendered; auto-accepted slices must not be marked. */
  readonly present: (sliceId: SetupSliceId) => void;
  readonly accept: <K extends SetupSliceId>(
    sliceId: K,
    output: SetupSliceOutputById[K],
  ) => Promise<void>;
  readonly back: () => BackResult;
  readonly edit: (sliceId: SetupSliceId) => void;
  /** Execute the one restore publication boundary, if the resolver requests it. */
  readonly runPendingEffect: (onProgress?: RestoreProgress) => Promise<NextSetupAction>;
  readonly finish: () => Promise<RestoreSetupOutcome>;
}

export function createSetupDraft(
  journeyId: RestoreJourneyId,
  operationId: RestoreSetupDraft['operationId'],
  entryPolicyOverride?: RestoreSetupDraft['entryPolicy'],
): RestoreSetupDraft {
  const recipe = getSetupRecipe(journeyId);
  const base = {
    schemaVersion: 1 as const,
    operationId,
    presentedHistory: [] as const,
    acceptedSlices: [] as const,
    entryPolicy: entryPolicyOverride ?? recipe.entryPolicy,
  };
  return { ...base, kind: 'restore', journeyId, restore: {} };
}

/** Seed and persist the restore journey entered from the first-run name step. */
export function startFirstRunRestoreFromDeviceName(
  name: string,
  store: Pick<SetupDraftStore, 'save'> = setupDraftStore,
): void {
  const seeded = createSetupDraft('first_run_restore', asWorkplaceId(generator()));
  const trimmed = name.trim();
  store.save(
    trimmed
      ? {
          ...seeded,
          restore: { deviceCandidate: { value: trimmed, source: 'user_entered' } },
        }
      : seeded,
  );
}

function appendUnique(items: readonly SetupSliceId[], item: SetupSliceId): readonly SetupSliceId[] {
  return items.includes(item) ? items : [...items, item];
}

function withoutSlices(
  items: readonly SetupSliceId[],
  removed: readonly SetupSliceId[],
): readonly SetupSliceId[] {
  return items.filter(id => !removed.includes(id));
}

function applyRestoreSource(
  draft: RestoreSetupDraft,
  output: readonly RestoreSourceOutput[],
): RestoreSetupDraft {
  if (sameRestoreSources(draft.restore.sources, output)) {
    return {
      ...draft,
      acceptedSlices: appendUnique(draft.acceptedSlices, 'restore_source'),
      restore: { ...draft.restore, sources: output },
    };
  }
  return {
    ...draft,
    acceptedSlices: appendUnique(
      withoutSlices(draft.acceptedSlices, SOURCE_DOWNSTREAM),
      'restore_source',
    ),
    restore: {
      sources: output,
      ...(draft.restore.deviceCandidate ? { deviceCandidate: draft.restore.deviceCandidate } : {}),
    },
    workplace: undefined,
    device: undefined,
  };
}

function applyOutput(draft: RestoreSetupDraft, acceptance: SliceAcceptance): RestoreSetupDraft {
  const acceptedSlices = appendUnique(draft.acceptedSlices, acceptance.sliceId);
  switch (acceptance.sliceId) {
    case 'device':
      return { ...draft, acceptedSlices, device: acceptance.output };
    case 'workplace':
      return { ...draft, acceptedSlices, workplace: acceptance.output };
    case 'restore_source':
      return applyRestoreSource(draft, acceptance.output);
    case 'restore_summary':
      return {
        ...draft,
        acceptedSlices,
        restore: { ...draft.restore, summary: acceptance.output },
      };
    default:
      throw new Error(`Unsupported restore slice: ${String(acceptance.sliceId)}`);
  }
}

function commitDevice(
  effects: SetupCoordinatorOptions['effects'],
  output: DeviceSetupOutput,
): void {
  if (!effects?.commitDevice) throw new Error('Device checkpoint is not configured');
  effects.commitDevice(output);
}

/** Create the small linear coordinator used by Setup screens and tests. */
export function createSetupCoordinator(options: SetupCoordinatorOptions): SetupCoordinator {
  const recipe = options.recipe ?? getSetupRecipe(options.journeyId);
  const store = options.draftStore ?? setupDraftStore;
  let draft: RestoreSetupDraft = options.draft ?? createSetupDraft(options.journeyId, options.operationId);

  const persist = (next: RestoreSetupDraft): void => {
    store.save(next);
    draft = next;
  };

  const next = (): NextSetupAction => resolveNextSetupAction(recipe, draft, options.resolution);

  const accept = async <K extends SetupSliceId>(
    sliceId: K,
    output: SetupSliceOutputById[K],
  ): Promise<void> => {
    const action = next();
    if (action.kind !== 'present' || action.sliceId !== sliceId) {
      throw new Error(
        `Cannot accept ${sliceId}; Setup is waiting for ${action.kind === 'present' ? action.sliceId : action.kind}`,
      );
    }
    await options.validate?.(sliceId, output, draft);
    if (
      sliceId === 'restore_source' &&
      (draft.restore.handoffs?.length ?? 0) > 0 &&
      !sameRestoreSources(draft.restore.sources, output as readonly RestoreSourceOutput[])
    ) {
      if (!options.effects?.discardRestorePublication) {
        throw new Error('Restore publication cleanup is not configured');
      }
      await options.effects.discardRestorePublication(draft);
    }
    const acceptance = { sliceId, output } as SliceAcceptance;
    if (sliceId === 'device') commitDevice(options.effects, output as DeviceSetupOutput);
    const terminal = recipeTerminalSlice(recipe);
    const nextDraft = applyOutput(draft, acceptance);
    const returnToTerminal = sliceId !== terminal && nextDraft.acceptedSlices.includes(terminal);
    persist({
      ...nextDraft,
      activeSlice: returnToTerminal ? terminal : undefined,
      presentedHistory: appendUnique(draft.presentedHistory, sliceId),
    });
  };

  const present = (sliceId: SetupSliceId): void => {
    if (!recipeContainsSlice(recipe, sliceId))
      throw new Error(`Slice ${sliceId} is not in this Setup recipe`);
    persist({ ...draft, presentedHistory: appendUnique(draft.presentedHistory, sliceId) });
  };

  const advanceAutoAccepted = async (): Promise<NextSetupAction> => {
    let action = next();
    while (action.kind === 'auto_accept') {
      if (action.sliceId === 'device') commitDevice(options.effects, action.output);
      const updated = applyOutput(draft, action);
      persist({
        ...updated,
        presentedHistory: updated.presentedHistory,
        activeSlice: undefined,
      });
      action = next();
    }
    return action;
  };

  const back = (): BackResult => {
    const history = [...draft.presentedHistory];
    const action = next();
    const current =
      draft.activeSlice ?? (action.kind === 'present' ? action.sliceId : history.at(-1));
    if (current === undefined) return { kind: 'at_start' };
    const currentIndex = history.lastIndexOf(current);
    const previous =
      currentIndex === -1
        ? history.at(-1)
        : currentIndex > 0
          ? history[currentIndex - 1]
          : undefined;
    if (previous === undefined) {
      persist({ ...draft, activeSlice: undefined });
      return { kind: 'at_start' };
    }
    persist({ ...draft, activeSlice: previous });
    return { kind: 'present', sliceId: previous };
  };

  const edit = (sliceId: SetupSliceId): void => {
    if (!recipeContainsSlice(recipe, sliceId))
      throw new Error(`Slice ${sliceId} is not in this Setup recipe`);
    persist({ ...draft, activeSlice: sliceId });
  };

  const runPendingEffect = async (onProgress?: RestoreProgress): Promise<NextSetupAction> => {
    const action = await advanceAutoAccepted();
    if (action.kind !== 'run_effect' || action.effectId !== 'publish_restore') return action;
    if (!options.effects?.publishRestore) {
      throw new Error('Restore publication effect is not configured');
    }
    const handoffs = await options.effects.publishRestore(draft, onProgress);
    persist({
      ...draft,
      restore: {
        ...draft.restore,
        handoffs,
      },
    });
    return advanceAutoAccepted();
  };

  const finish = async (): Promise<RestoreSetupOutcome> => {
    const action = next();
    if (action.kind !== 'finish')
      throw new Error(`Cannot finish while Setup action is ${action.kind}`);
    const outcome = await options.finish(draft);
    store.clear();
    return outcome;
  };

  return {
    getDraft: () => draft,
    next,
    advanceAutoAccepted,
    present,
    accept,
    back,
    edit,
    runPendingEffect,
    finish,
  };
}
