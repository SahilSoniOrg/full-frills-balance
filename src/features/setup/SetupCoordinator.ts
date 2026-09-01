import type { SetupRecipe } from './setupRecipes';
import {
  resolveNextSetupAction,
  type NextSetupAction,
  type SetupResolutionDefinitions,
} from './resolveNextSetupAction';
import type {
  DeviceSetupOutput,
  RestoreHandoff,
  RestoreSetupDraft,
  RestoreSourceOutput,
  SetupSliceAcceptance,
  SetupSliceOutputById,
  SetupDraft,
  SetupJourneyId,
  SetupOutcome,
  SetupSliceId,
  SetupSliceOutput,
} from './setupTypes';
import { isRestoreJourneyId } from './setupTypes';
import { getSetupRecipe, recipeContainsSlice, recipeTerminalSlice } from './setupRecipes';
import { SetupDraftStore, setupDraftStore } from './SetupDraftStore';
import { generator } from '@/src/data/database/idGenerator';
import type { WorkplaceId } from '@/src/types/ids';

type SliceAcceptance = SetupSliceAcceptance;

const SOURCE_DOWNSTREAM: readonly SetupSliceId[] = [
  'workplace',
  'restore_summary',
  'device',
  'appearance',
  'summary',
];

export interface SetupCoordinatorOptions {
  readonly journeyId: SetupJourneyId;
  readonly operationId: SetupDraft['operationId'];
  readonly recipe?: SetupRecipe;
  readonly draft?: SetupDraft;
  readonly draftStore?: Pick<SetupDraftStore, 'save' | 'clear'>;
  readonly resolution?: SetupResolutionDefinitions;
  readonly validate?: (
    sliceId: SetupSliceId,
    output: SetupSliceOutput,
    draft: SetupDraft,
  ) => void | Promise<void>;
  readonly effects?: {
    readonly publishRestore?: (draft: RestoreSetupDraft) => Promise<RestoreHandoff>;
    readonly commitDevice?: (output: DeviceSetupOutput) => void;
  };
  readonly finish: (draft: SetupDraft) => Promise<SetupOutcome>;
}

export type { SetupSliceOutputById } from './setupTypes';

export type BackResult =
  { readonly kind: 'at_start' } | { readonly kind: 'present'; readonly sliceId: SetupSliceId };

export interface SetupCoordinator {
  readonly getDraft: () => SetupDraft;
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
  readonly runPendingEffect: () => Promise<NextSetupAction>;
  readonly finish: () => Promise<SetupOutcome>;
}

export function createSetupDraft(
  journeyId: SetupJourneyId,
  operationId: SetupDraft['operationId'],
  entryPolicyOverride?: SetupDraft['entryPolicy'],
): SetupDraft {
  const recipe = getSetupRecipe(journeyId);
  const base = {
    schemaVersion: 1 as const,
    operationId,
    presentedHistory: [] as const,
    acceptedSlices: [] as const,
    entryPolicy: entryPolicyOverride ?? recipe.entryPolicy,
  };
  if (recipe.draftKind === 'first_run') {
    return { ...base, kind: 'first_run', journeyId: 'first_run', entryPolicy: 'blocking' };
  }
  if (recipe.draftKind === 'workplace_creation') {
    if (journeyId !== 'empty_device_workplace' && journeyId !== 'create_workplace') {
      throw new Error(`Workplace creation cannot use journey ${journeyId}`);
    }
    return { ...base, kind: 'workplace_creation', journeyId };
  }
  if (!isRestoreJourneyId(journeyId)) {
    throw new Error(`Restore cannot use journey ${journeyId}`);
  }
  return { ...base, kind: 'restore', journeyId, restore: {} };
}

/** Seed and persist the restore journey entered from the first-run name step. */
export function startFirstRunRestoreFromDeviceName(
  name: string,
  store: Pick<SetupDraftStore, 'save'> = setupDraftStore,
): void {
  const seeded = createSetupDraft('first_run_restore', generator() as WorkplaceId);
  const trimmed = name.trim();
  store.save(
    trimmed && seeded.kind === 'restore'
      ? {
          ...seeded,
          restore: {
            deviceCandidate: { value: trimmed, source: 'user_entered' },
          },
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
  output: RestoreSourceOutput,
): RestoreSetupDraft {
  const previousFingerprint = draft.restore.source?.source.fingerprint;
  const publishedFingerprint = draft.restore.handoff?.fingerprint;
  if (publishedFingerprint !== undefined && publishedFingerprint !== output.source.fingerprint) {
    throw new Error('Published restore cannot switch to a different backup');
  }
  if (previousFingerprint === output.source.fingerprint) {
    return {
      ...draft,
      acceptedSlices: appendUnique(draft.acceptedSlices, 'restore_source'),
      restore: { ...draft.restore, source: output },
    };
  }
  return {
    ...draft,
    acceptedSlices: appendUnique(
      withoutSlices(draft.acceptedSlices, SOURCE_DOWNSTREAM),
      'restore_source',
    ),
    restore: {
      source: output,
      ...(draft.restore.deviceCandidate ? { deviceCandidate: draft.restore.deviceCandidate } : {}),
    },
    workplace: undefined,
    device: undefined,
    appearance: undefined,
    summary: undefined,
  };
}

function applyOutput(draft: SetupDraft, acceptance: SliceAcceptance): SetupDraft {
  const acceptedSlices = appendUnique(draft.acceptedSlices, acceptance.sliceId);
  switch (acceptance.sliceId) {
    case 'device':
      if (draft.kind === 'workplace_creation') {
        throw new Error('Device slice is not in this Setup journey');
      }
      return { ...draft, acceptedSlices, device: acceptance.output };
    case 'workplace':
      return { ...draft, acceptedSlices, workplace: acceptance.output };
    case 'appearance':
      if (draft.kind === 'workplace_creation') {
        throw new Error('Appearance slice is not in this Setup journey');
      }
      return { ...draft, acceptedSlices, appearance: acceptance.output };
    case 'restore_source':
      if (draft.kind !== 'restore') throw new Error('Restore source is not in this Setup journey');
      return applyRestoreSource(draft, acceptance.output);
    case 'restore_summary':
      if (draft.kind !== 'restore') throw new Error('Restore summary is not in this Setup journey');
      return {
        ...draft,
        acceptedSlices,
        restore: { ...draft.restore, summary: acceptance.output },
      };
    case 'summary':
      return { ...draft, acceptedSlices, summary: acceptance.output };
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
  let draft = options.draft ?? createSetupDraft(options.journeyId, options.operationId);

  const persist = (next: SetupDraft): void => {
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

  const runPendingEffect = async (): Promise<NextSetupAction> => {
    const action = await advanceAutoAccepted();
    if (action.kind !== 'run_effect' || action.effectId !== 'publish_restore') return action;
    if (draft.kind !== 'restore' || !options.effects?.publishRestore) {
      throw new Error('Restore publication effect is not configured');
    }
    const handoff = await options.effects.publishRestore(draft);
    persist({ ...draft, restore: { ...draft.restore, handoff } });
    return next();
  };

  const finish = async (): Promise<SetupOutcome> => {
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
