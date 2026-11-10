import {
  listCaptureItems,
  countCaptureReviewItems,
  listCaptureCategoryDefaults,
  listCaptureDescriptionDefaults,
  subscribeToCaptureChanges,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { transactionCaptureService } from '@/src/services/transaction-intelligence/transactionCaptureService';
import type { WorkplaceId } from '@/src/types/ids';
import type { CaptureReviewItem } from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';

type CaptureSettings = Awaited<ReturnType<typeof transactionCaptureService.getSettings>>;
type CaptureItems = Awaited<ReturnType<typeof listCaptureItems>>;
type CategoryDefaults = Awaited<ReturnType<typeof listCaptureCategoryDefaults>>;
type DescriptionDefaults = ReturnType<typeof listCaptureDescriptionDefaults>;

export type CaptureSettingsState = {
  data: CaptureSettings | null;
  error: boolean;
  loading: boolean;
};

export type CaptureListsState = {
  data: {
    reviewCount: number;
    review: CaptureReviewItem[];
    defaulted: CaptureReviewItem[];
    categoryDefaults: CategoryDefaults;
    descriptionDefaults: DescriptionDefaults;
    categoryCandidates: CaptureItems['categoryCandidates'];
    descriptionCandidates: CaptureItems['descriptionCandidates'];
    historicalCategorySuggestions: CaptureItems['historicalCategorySuggestions'];
    mixedHistoricalCategoryPatterns: HistoricalCategoryPattern[];
    mixedHistoricalCategoryCount: number;
  } | null;
  error: boolean;
  loading: boolean;
};

export type CaptureWorkspaceSnapshot = {
  workplaceId: WorkplaceId;
  settings: CaptureSettingsState;
  lists: CaptureListsState;
  changeRevision: number;
};

export type CaptureLoadOptions = {
  loadReviewItems?: boolean;
  loadCategoryDefaults?: boolean;
  loadHistoricalSuggestions?: boolean;
};

type Listener = () => void;

type WorkplaceEntry = {
  snapshot: CaptureWorkspaceSnapshot;
  listeners: Set<Listener>;
  loadGeneration: number;
  inFlight: Promise<void> | null;
  loadedAt: number;
  dirty: boolean;
  loadedOptions: CaptureLoadOptions;
  options: CaptureLoadOptions;
  unsubscribeChanges: (() => void) | null;
  changeDebounce: ReturnType<typeof setTimeout> | undefined;
};

const CACHE_MAX_AGE_MS = 30_000;

function emptySnapshot(workplaceId: WorkplaceId): CaptureWorkspaceSnapshot {
  return {
    workplaceId,
    settings: { data: null, error: false, loading: true },
    lists: { data: null, error: false, loading: true },
    changeRevision: 0,
  };
}

const entries = new Map<WorkplaceId, WorkplaceEntry>();

function entryFor(workplaceId: WorkplaceId): WorkplaceEntry {
  let entry = entries.get(workplaceId);
  if (!entry) {
    entry = {
      snapshot: emptySnapshot(workplaceId),
      listeners: new Set(),
      loadGeneration: 0,
      inFlight: null,
      loadedAt: 0,
      dirty: true,
      loadedOptions: {},
      options: {},
      unsubscribeChanges: null,
      changeDebounce: undefined,
    };
    entries.set(workplaceId, entry);
  }
  return entry;
}

function emit(entry: WorkplaceEntry): void {
  for (const listener of entry.listeners) listener();
}

function mergeOptions(current: CaptureLoadOptions, next: CaptureLoadOptions): CaptureLoadOptions {
  return {
    loadReviewItems: current.loadReviewItems || next.loadReviewItems,
    loadCategoryDefaults: current.loadCategoryDefaults || next.loadCategoryDefaults,
    loadHistoricalSuggestions: current.loadHistoricalSuggestions || next.loadHistoricalSuggestions,
  };
}

function coversOptions(loaded: CaptureLoadOptions, requested: CaptureLoadOptions): boolean {
  return (
    (!requested.loadReviewItems || loaded.loadReviewItems === true) &&
    (!requested.loadCategoryDefaults || loaded.loadCategoryDefaults === true) &&
    (!requested.loadHistoricalSuggestions || loaded.loadHistoricalSuggestions === true)
  );
}

async function load(workplaceId: WorkplaceId, options: CaptureLoadOptions): Promise<void> {
  const entry = entryFor(workplaceId);
  entry.options = mergeOptions(entry.options, options);
  const request = ++entry.loadGeneration;
  const revisionAtStart = entry.snapshot.changeRevision;
  const cached = entry.snapshot;
  const hasSettings = !!cached.settings.data;
  const hasLists = !!cached.lists.data;
  entry.snapshot = {
    ...cached,
    settings: { ...cached.settings, loading: !hasSettings, error: false },
    lists: { ...cached.lists, loading: !hasLists, error: false },
  };
  emit(entry);

  const loadOptions = entry.options;
  try {
    const [settings, items, reviewCount, categoryDefaults] = await Promise.allSettled([
      transactionCaptureService.getSettings(workplaceId),
      loadOptions.loadReviewItems
        ? listCaptureItems(workplaceId, {
            includeHistorical: !!loadOptions.loadHistoricalSuggestions,
          })
        : Promise.resolve(null),
      countCaptureReviewItems(workplaceId),
      loadOptions.loadCategoryDefaults
        ? listCaptureCategoryDefaults(workplaceId)
        : Promise.resolve([] as CategoryDefaults),
    ]);
    if (request !== entry.loadGeneration) return;

    const settingsError = settings.status === 'rejected';
    const listsError =
      items.status === 'rejected' ||
      reviewCount.status === 'rejected' ||
      categoryDefaults.status === 'rejected';
    const previousLists = cached.lists.data;

    entry.snapshot = {
      workplaceId,
      changeRevision: entry.snapshot.changeRevision,
      settings: {
        data: settings.status === 'fulfilled' ? settings.value : cached.settings.data,
        error: settingsError,
        loading: false,
      },
      lists: {
        data: {
          reviewCount:
            items.status === 'fulfilled' && items.value
              ? items.value.review.length
              : reviewCount.status === 'fulfilled'
                ? reviewCount.value
                : (previousLists?.reviewCount ?? 0),
          review:
            items.status === 'fulfilled' && items.value
              ? items.value.review
              : (previousLists?.review ?? []),
          defaulted:
            items.status === 'fulfilled' && items.value
              ? items.value.defaulted
              : (previousLists?.defaulted ?? []),
          categoryDefaults:
            categoryDefaults.status === 'fulfilled'
              ? categoryDefaults.value
              : (previousLists?.categoryDefaults ?? []),
          descriptionDefaults: listCaptureDescriptionDefaults(workplaceId),
          categoryCandidates:
            items.status === 'fulfilled' && items.value
              ? items.value.categoryCandidates
              : (previousLists?.categoryCandidates ?? []),
          descriptionCandidates:
            items.status === 'fulfilled' && items.value
              ? items.value.descriptionCandidates
              : (previousLists?.descriptionCandidates ?? []),
          historicalCategorySuggestions:
            items.status === 'fulfilled' && items.value
              ? items.value.historicalCategorySuggestions
              : (previousLists?.historicalCategorySuggestions ?? []),
          mixedHistoricalCategoryPatterns:
            items.status === 'fulfilled' && items.value
              ? items.value.mixedHistoricalCategoryPatterns
              : (previousLists?.mixedHistoricalCategoryPatterns ?? []),
          mixedHistoricalCategoryCount:
            items.status === 'fulfilled' && items.value
              ? items.value.mixedHistoricalCategoryCount
              : (previousLists?.mixedHistoricalCategoryCount ?? 0),
        },
        error: listsError,
        loading: false,
      },
    };
    entry.loadedAt = Date.now();
    entry.loadedOptions = loadOptions;
    entry.dirty = entry.snapshot.changeRevision !== revisionAtStart;
    emit(entry);
  } catch {
    if (request !== entry.loadGeneration) return;
    entry.dirty = true;
    entry.snapshot = {
      ...entry.snapshot,
      settings: { ...entry.snapshot.settings, error: true, loading: false },
      lists: { ...entry.snapshot.lists, error: true, loading: false },
    };
    emit(entry);
  }
}

function ensureSubscribed(workplaceId: WorkplaceId): void {
  const entry = entryFor(workplaceId);
  if (entry.unsubscribeChanges) return;
  entry.unsubscribeChanges = subscribeToCaptureChanges(() => {
    entry.snapshot = {
      ...entry.snapshot,
      changeRevision: entry.snapshot.changeRevision + 1,
    };
    entry.dirty = true;
    if (entry.changeDebounce) clearTimeout(entry.changeDebounce);
    entry.changeDebounce = setTimeout(() => {
      entry.changeDebounce = undefined;
      if (entry.listeners.size === 0) return;
      void refresh(workplaceId, entry.options);
    }, 250);
    emit(entry);
  });
}

export function getCaptureWorkspaceSnapshot(workplaceId: WorkplaceId): CaptureWorkspaceSnapshot {
  return entryFor(workplaceId).snapshot;
}

export function subscribeCaptureWorkspace(
  workplaceId: WorkplaceId,
  listener: Listener,
): () => void {
  const entry = entryFor(workplaceId);
  entry.listeners.add(listener);
  ensureSubscribed(workplaceId);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0) return;
    entry.unsubscribeChanges?.();
    entry.unsubscribeChanges = null;
    if (entry.changeDebounce) clearTimeout(entry.changeDebounce);
    entry.changeDebounce = undefined;
  };
}

export async function refresh(
  workplaceId: WorkplaceId,
  options: CaptureLoadOptions = {},
): Promise<void> {
  const entry = entryFor(workplaceId);
  entry.options = mergeOptions(entry.options, options);
  while (entry.inFlight) await entry.inFlight;
  const work = load(workplaceId, entry.options);
  entry.inFlight = work;
  try {
    await work;
  } finally {
    if (entry.inFlight === work) entry.inFlight = null;
  }
}

/** Refresh on focus only when the cached workplace snapshot is stale or incomplete. */
export async function refreshIfStale(
  workplaceId: WorkplaceId,
  options: CaptureLoadOptions = {},
): Promise<void> {
  const entry = entryFor(workplaceId);
  entry.options = mergeOptions(entry.options, options);
  while (entry.inFlight) await entry.inFlight;

  const hasSnapshot = !!entry.snapshot.settings.data && !!entry.snapshot.lists.data;
  const isFresh = Date.now() - entry.loadedAt < CACHE_MAX_AGE_MS;
  if (
    hasSnapshot &&
    isFresh &&
    !entry.dirty &&
    !entry.snapshot.settings.error &&
    !entry.snapshot.lists.error &&
    coversOptions(entry.loadedOptions, entry.options)
  )
    return;

  await refresh(workplaceId, entry.options);
}

/** Test-only reset between workplaces/cases. */
export function resetCaptureWorkspaceStoreForTests(): void {
  for (const entry of entries.values()) {
    entry.unsubscribeChanges?.();
    if (entry.changeDebounce) clearTimeout(entry.changeDebounce);
  }
  entries.clear();
}
