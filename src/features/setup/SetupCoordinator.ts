import type { SetupRecipe } from './setupRecipes';
import {
  resolveNextSetupAction,
  type NextSetupAction,
  type SetupResolutionDefinitions,
} from './resolveNextSetupAction';
import type {
  AppearanceSetupOutput,
  DeviceSetupOutput,
  RestoreHandoff,
  RestoreSetupDraft,
  RestoreSourceOutput,
  RestoreSummaryOutput,
  SetupDraft,
  SetupJourneyId,
  SetupOutcome,
  SetupSliceId,
  SetupSliceOutput,
  SetupSummaryOutput,
  WorkplaceSetupOutput,
} from './setupTypes';
import { getSetupRecipe } from './setupRecipes';
import { SetupDraftStore, setupDraftStore } from './SetupDraftStore';

export interface SetupSliceOutputById {
  readonly device: DeviceSetupOutput;
  readonly restore_source: RestoreSourceOutput;
  readonly workplace: WorkplaceSetupOutput;
  readonly restore_summary: RestoreSummaryOutput;
  readonly appearance: AppearanceSetupOutput;
  readonly summary: SetupSummaryOutput;
}

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
  };
  readonly finishers: {
    readonly firstRun?: (
      draft: Extract<SetupDraft, { readonly kind: 'first_run' }>,
    ) => Promise<SetupOutcome>;
    readonly restore?: (
      draft: Extract<SetupDraft, { readonly kind: 'restore' }>,
    ) => Promise<SetupOutcome>;
    readonly workplaceCreation?: (
      draft: Extract<SetupDraft, { readonly kind: 'workplace_creation' }>,
    ) => Promise<SetupOutcome>;
  };
}

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
  const base = {
    schemaVersion: 1 as const,
    operationId,
    presentedHistory: [],
    acceptedSlices: [],
  };
  if (journeyId === 'first_run') {
    return { ...base, kind: 'first_run', journeyId, entryPolicy: 'blocking' };
  }
  if (journeyId === 'empty_device_workplace' || journeyId === 'create_workplace') {
    return {
      ...base,
      kind: 'workplace_creation',
      journeyId,
      entryPolicy:
        entryPolicyOverride ?? (journeyId === 'create_workplace' ? 'optional' : 'blocking'),
    };
  }
  return {
    ...base,
    kind: 'restore',
    journeyId,
    entryPolicy:
      entryPolicyOverride ?? (journeyId === 'settings_restore' ? 'optional' : 'blocking'),
    restore: {},
  };
}

function appendUnique(items: readonly SetupSliceId[], item: SetupSliceId): readonly SetupSliceId[] {
  return items.includes(item) ? items : [...items, item];
}

function recipeContains(recipe: SetupRecipe, sliceId: SetupSliceId): boolean {
  return recipe.entries.some(entry => entry.kind === 'slice' && entry.sliceId === sliceId);
}

function applyOutput(
  draft: SetupDraft,
  sliceId: SetupSliceId,
  output: SetupSliceOutput,
): SetupDraft {
  const acceptedSlices = appendUnique(draft.acceptedSlices, sliceId);
  switch (sliceId) {
    case 'device':
      if (draft.kind === 'first_run')
        return { ...draft, acceptedSlices, device: output as DeviceSetupOutput };
      if (draft.kind === 'restore')
        return { ...draft, acceptedSlices, device: output as DeviceSetupOutput };
      throw new Error('Device slice is not in this Setup journey');
    case 'workplace':
      return { ...draft, acceptedSlices, workplace: output as WorkplaceSetupOutput };
    case 'appearance':
      if (draft.kind === 'first_run')
        return { ...draft, acceptedSlices, appearance: output as AppearanceSetupOutput };
      if (draft.kind === 'restore')
        return { ...draft, acceptedSlices, appearance: output as AppearanceSetupOutput };
      throw new Error('Appearance slice is not in this Setup journey');
    case 'restore_source':
      if (draft.kind === 'restore') {
        return {
          ...draft,
          acceptedSlices,
          restore: { ...draft.restore, source: output as RestoreSourceOutput },
        };
      }
      throw new Error('Restore source is not in this Setup journey');
    case 'restore_summary':
      if (draft.kind === 'restore') {
        return {
          ...draft,
          acceptedSlices,
          restore: { ...draft.restore, summary: output as RestoreSummaryOutput },
        };
      }
      throw new Error('Restore summary is not in this Setup journey');
    case 'summary':
      return { ...draft, acceptedSlices, summary: output as SetupSummaryOutput };
  }
}

function terminalSlice(recipe: SetupRecipe): SetupSliceId {
  return recipeContains(recipe, 'summary') ? 'summary' : 'restore_summary';
}

/** Create the small linear coordinator used by Setup screens and tests. */
export function createSetupCoordinator(options: SetupCoordinatorOptions): SetupCoordinator {
  const recipe = options.recipe ?? getSetupRecipe(options.journeyId);
  const store = options.draftStore ?? setupDraftStore;
  let draft = options.draft ?? createSetupDraft(options.journeyId, options.operationId);
  store.save(draft);

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
    let updated = applyOutput(draft, sliceId, output);
    const editing = draft.editingSlice === sliceId;
    updated = {
      ...updated,
      activeSlice: editing ? terminalSlice(recipe) : undefined,
      editingSlice: undefined,
      presentedHistory: appendUnique(updated.presentedHistory, sliceId),
    };
    persist(updated);
  };

  const present = (sliceId: SetupSliceId): void => {
    if (!recipeContains(recipe, sliceId))
      throw new Error(`Slice ${sliceId} is not in this Setup recipe`);
    persist({ ...draft, presentedHistory: appendUnique(draft.presentedHistory, sliceId) });
  };

  const advanceAutoAccepted = async (): Promise<NextSetupAction> => {
    let action = next();
    while (action.kind === 'auto_accept') {
      const updated = applyOutput(draft, action.sliceId, action.output);
      persist({
        ...updated,
        presentedHistory: updated.presentedHistory,
        activeSlice: undefined,
        editingSlice: undefined,
      });
      action = next();
    }
    return action;
  };

  const back = (): BackResult => {
    const history = [...draft.presentedHistory];
    const current = draft.activeSlice ?? history.pop();
    if (current === undefined) return { kind: 'at_start' };
    const previous = history.pop();
    if (previous === undefined) {
      persist({
        ...draft,
        presentedHistory: history,
        activeSlice: undefined,
        editingSlice: undefined,
      });
      return { kind: 'at_start' };
    }
    persist({
      ...draft,
      presentedHistory: [...history, previous],
      activeSlice: previous,
      editingSlice: undefined,
    });
    return { kind: 'present', sliceId: previous };
  };

  const edit = (sliceId: SetupSliceId): void => {
    if (!recipeContains(recipe, sliceId))
      throw new Error(`Slice ${sliceId} is not in this Setup recipe`);
    persist({ ...draft, activeSlice: sliceId, editingSlice: sliceId });
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
    let outcome: SetupOutcome;
    if (draft.kind === 'first_run') {
      if (!options.finishers.firstRun) throw new Error('First-run finisher is not configured');
      outcome = await options.finishers.firstRun(draft);
    } else if (draft.kind === 'restore') {
      if (!options.finishers.restore) throw new Error('Restore finisher is not configured');
      outcome = await options.finishers.restore(draft);
    } else {
      if (!options.finishers.workplaceCreation)
        throw new Error('Workplace-creation finisher is not configured');
      outcome = await options.finishers.workplaceCreation(draft);
    }
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

export type SetupLaunchProjection = { readonly kind: 'setup'; readonly journeyId: SetupJourneyId };

export function projectBlockingSetupLaunch(
  draft: SetupDraft | undefined,
): SetupLaunchProjection | undefined {
  return draft?.entryPolicy === 'blocking'
    ? { kind: 'setup', journeyId: draft.journeyId }
    : undefined;
}
