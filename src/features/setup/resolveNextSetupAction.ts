import type {
  SetupDraft,
  SetupEffectId,
  SetupProgress,
  SetupSliceId,
  SetupSliceOutput,
  SetupAutoAcceptAction,
  SetupSliceOutputById,
} from './setupTypes';
import type { SetupRecipe, SetupRecipeEntry } from './setupRecipes';

export type NextSetupAction =
  | { readonly kind: 'present'; readonly sliceId: SetupSliceId; readonly progress: SetupProgress }
  | SetupAutoAcceptAction
  | { readonly kind: 'run_effect'; readonly effectId: SetupEffectId }
  | { readonly kind: 'finish' };

export interface SetupResolutionDefinitions {
  /** Return an authoritative output only when the slice is complete without presentation. */
  readonly getAutoOutput?: (
    sliceId: SetupSliceId,
    draft: SetupDraft,
  ) => SetupSliceOutput | undefined;
}

function isAccepted(draft: SetupDraft, sliceId: SetupSliceId): boolean {
  return draft.acceptedSlices.includes(sliceId);
}

function isRestorePublicationComplete(draft: SetupDraft): boolean {
  return draft.kind === 'restore' && draft.restore.handoff?.operationId === draft.operationId;
}

function isEffectComplete(draft: SetupDraft, entry: SetupRecipeEntry): boolean {
  return entry.kind === 'effect' && entry.effectId === 'publish_restore'
    ? isRestorePublicationComplete(draft)
    : false;
}

function hasAutoOutput(
  entry: Extract<SetupRecipeEntry, { readonly kind: 'slice' }>,
  draft: SetupDraft,
  definitions: SetupResolutionDefinitions,
): boolean {
  return (
    entry.policy === 'when_missing' &&
    definitions.getAutoOutput?.(entry.sliceId, draft) !== undefined
  );
}

/**
 * Calculate progress from slices which can actually be presented. Auto-accepted
 * slices are deliberately absent from both history and the progress count.
 */
function progressFor(
  recipe: SetupRecipe,
  draft: SetupDraft,
  definitions: SetupResolutionDefinitions,
  currentSlice: SetupSliceId,
): SetupProgress {
  const presented = new Set(draft.presentedHistory);
  const visibleSlices: SetupSliceId[] = [];

  for (const entry of recipe.entries) {
    if (entry.kind !== 'slice') continue;
    const accepted = isAccepted(draft, entry.sliceId);
    const autoAccepted = !accepted && hasAutoOutput(entry, draft, definitions);
    const isConditional = entry.policy === 'when_missing';
    const isVisibleBeforePresentation = presented.has(entry.sliceId) || !isConditional;
    if (!autoAccepted && (isVisibleBeforePresentation || entry.sliceId === currentSlice)) {
      visibleSlices.push(entry.sliceId);
    }
  }

  if (!visibleSlices.includes(currentSlice)) visibleSlices.push(currentSlice);
  const index = visibleSlices.indexOf(currentSlice);
  return {
    current: index + 1,
    total: visibleSlices.length,
    completed: Math.max(0, index),
  };
}

function presentAction(
  recipe: SetupRecipe,
  draft: SetupDraft,
  definitions: SetupResolutionDefinitions,
  sliceId: SetupSliceId,
): NextSetupAction {
  return {
    kind: 'present',
    sliceId,
    progress: progressFor(recipe, draft, definitions, sliceId),
  };
}

function autoAcceptAction<K extends SetupSliceId>(
  sliceId: K,
  output: SetupSliceOutputById[K],
): SetupAutoAcceptAction {
  return { kind: 'auto_accept', sliceId, output } as SetupAutoAcceptAction;
}

/** Resolve one observable action. It performs no persistence, navigation, or other effects. */
export function resolveNextSetupAction(
  recipe: SetupRecipe,
  draft: SetupDraft,
  definitions: SetupResolutionDefinitions = {},
): NextSetupAction {
  if (draft.activeSlice) {
    const activeEntry = recipe.entries.find(
      entry => entry.kind === 'slice' && entry.sliceId === draft.activeSlice,
    );
    if (activeEntry?.kind === 'slice') {
      return presentAction(recipe, draft, definitions, activeEntry.sliceId);
    }
  }

  for (const entry of recipe.entries) {
    if (entry.kind === 'effect') {
      if (!isEffectComplete(draft, entry)) {
        return { kind: 'run_effect', effectId: entry.effectId };
      }
      continue;
    }

    if (isAccepted(draft, entry.sliceId)) continue;

    if (entry.policy === 'when_missing') {
      const output = definitions.getAutoOutput?.(entry.sliceId, draft);
      if (output !== undefined) {
        return autoAcceptAction(entry.sliceId, output);
      }
    }

    return presentAction(recipe, draft, definitions, entry.sliceId);
  }

  return { kind: 'finish' };
}
