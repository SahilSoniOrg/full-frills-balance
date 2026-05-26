/**
 * usePaginatedObservable - Generic hook for paginated observable data with enrichment
 *
 * Encapsulates common pagination logic:
 * - Pagination state management (currentLimit, hasMore, isLoadingMore)
 * - Date range key memoization for filter changes
 * - Filter change detection via refs (avoids full reload on pagination)
 * - Observable subscription lifecycle
 * - loadMore function
 * - Versioning to force re-renders on same-reference emissions
 */
import { useLayoutEffect, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Observable } from 'rxjs';

export interface DateRange {
  startDate: number;
  endDate: number;
}

export interface AccountDateRange extends DateRange {
  accountId?: string;
  accountVersion?: number;
  journalIds?: string[];
  plannedPaymentId?: string;
}

export interface UsePaginatedObservableOptions<T, E = T, F = unknown> {
  /** Number of items per page */
  pageSize: number;
  /** Optional filter object (previously dateRange) */
  filter?: F;
  /** Optional search query filter */
  searchQuery?: string;
  /** Factory function to create the observable */
  observe: (limit: number, filter?: F, searchQuery?: string) => Observable<T[]>;
  /** Optional enrichment function to transform raw items */
  enrich?: (items: T[], limit: number, filter?: F, searchQuery?: string) => Promise<E[]>;
  /** If true, filter changes don't clear the list or set isLoading to true */
  suppressResetOnSearch?: boolean;
  /** Optional key builder for filter to bypass object identity check */
  getFilterKey?: (filter: F) => string;
  /** Optional version key getter to force reload on version bump */
  getVersionKey?: (filter: F) => number;
  /** Optional initial items to show while the first page loads (e.g. from cache) */
  initialItems?: E[] | (() => E[]);
}

export interface UsePaginatedObservableResult<E> {
  items: E[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  version: number;
  error: Error | null;
  retry: () => void;
}

export function usePaginatedObservable<T, E = T, F = unknown>(
  options: UsePaginatedObservableOptions<T, E, F>,
): UsePaginatedObservableResult<E> {
  const {
    pageSize,
    filter,
    searchQuery,
    observe,
    enrich,
    suppressResetOnSearch = false,
    getFilterKey,
    getVersionKey,
    initialItems,
  } = options;

  const [resolvedInitialItems] = useState<E[]>(() => {
    if (!initialItems) return [];
    return typeof initialItems === 'function' ? (initialItems as () => E[])() : initialItems;
  });

  const [items, setItems] = useState<E[]>(resolvedInitialItems);
  const [isLoading, setIsLoading] = useState(resolvedInitialItems.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentLimit, setCurrentLimit] = useState(pageSize);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // We rely on callers to either memoize `filter` or provide `getFilterKey`.
  // If neither is strictly followed, we fall back to object reference which might churn if inline,
  // but this enforces clean downstream state models.
  const structuralKey = useMemo(() => {
    if (!filter) return `none-${searchQuery || ''}`;
    const filterPart = getFilterKey ? getFilterKey(filter) : 'ref';
    return `${filterPart}-${searchQuery || ''}`;
  }, [filter, searchQuery, getFilterKey]);

  // Track active props in a ref for use in effects without causing churn
  const propsRef = useRef({
    observe,
    enrich,
    filter,
    searchQuery,
    suppressResetOnSearch,
    pageSize,
  });
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    propsRef.current = { observe, enrich, filter, searchQuery, suppressResetOnSearch, pageSize };
    itemsRef.current = items;
  });

  // Version key for re-fetching without clearing (if filter object supports it)
  const versionKey = filter && getVersionKey ? getVersionKey(filter) : 0;

  // Track previous filter inputs to detect filter changes vs pagination
  const prevFilterRef = useRef({
    structuralKey,
    versionKey,
    observe,
    enrich,
    pageSize,
  });

  useEffect(() => {
    let isActive = true;
    let sequence = 0;

    const prev = prevFilterRef.current;
    const isStructuralChange =
      prev.structuralKey !== structuralKey ||
      prev.observe !== observe ||
      prev.enrich !== enrich ||
      prev.pageSize !== pageSize;
    const isVersionChange = prev.versionKey !== versionKey;

    const {
      observe: currentObserve,
      enrich: currentEnrich,
      filter: currentFilter,
      searchQuery: currentQuery,
      suppressResetOnSearch: currentSuppress,
      pageSize: AppPageSize,
    } = propsRef.current;

    if (isStructuralChange || isVersionChange) {
      const shouldSuppressReset =
        currentSuppress && prev.structuralKey !== structuralKey && prev.versionKey === versionKey;

      // Only show loading if it's a structural change or the list is currently empty.
      if (!shouldSuppressReset && (isStructuralChange || itemsRef.current.length === 0)) {
        setIsLoading(true);
      }

      setHasMore(true);
      prevFilterRef.current = {
        structuralKey,
        versionKey,
        observe: currentObserve,
        enrich: currentEnrich,
        pageSize: AppPageSize,
      };

      if (isStructuralChange) {
        if (!shouldSuppressReset) {
          // If we have initialItems and this is the VERY FIRST run, we preserve them
          if (
            sequence === 0 &&
            itemsRef.current.length > 0 &&
            itemsRef.current === resolvedInitialItems
          ) {
            // Keep initial items
          } else {
            setItems([]); // Clear items ONLY on structural changes
          }
        }
        if (currentLimit !== AppPageSize) {
          setCurrentLimit(AppPageSize); // Reset pagination
          return;
        }
      }
    }

    const observable = currentObserve(currentLimit, currentFilter, currentQuery);

    const subscription = observable.subscribe(async loaded => {
      const current = ++sequence;
      try {
        if (currentEnrich) {
          const enriched = await currentEnrich(loaded, currentLimit, currentFilter, currentQuery);
          if (!isActive || current !== sequence) return;
          setItems([...enriched] as E[]);
        } else {
          if (!isActive || current !== sequence) return;
          setItems([...loaded] as unknown as E[]);
        }
        setHasMore(loaded.length >= currentLimit);
        setVersion(v => v + 1);
        setIsLoading(false);
        setIsLoadingMore(false);
      } catch (err) {
        if (!isActive || current !== sequence) return;
        const normalizedError = err instanceof Error ? err : new Error(String(err));
        setError(normalizedError);
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [
    currentLimit,
    structuralKey,
    versionKey,
    retryKey,
    observe,
    enrich,
    pageSize,
    resolvedInitialItems,
  ]); // Added stable prop dependencies Log)

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setCurrentLimit(prev => prev + pageSize);
  }, [isLoadingMore, hasMore, pageSize]);

  const retry = () => {
    setError(null);
    if (items.length > 0) {
      // If we already have items, just trigger a re-observation with the current limit.
      // This is safer for "load more" failures as it doesn't wipe existing pages.
      setRetryKey(v => v + 1);
    } else {
      // Only full reset if we have no data at all
      setItems([]);
      setCurrentLimit(pageSize);
      setRetryKey(v => v + 1);
    }
  };

  return { items, isLoading, isLoadingMore, hasMore, loadMore, version, error, retry };
}
