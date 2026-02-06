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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Observable } from 'rxjs';

export interface DateRange {
    startDate: number;
    endDate: number;
}

export interface AccountDateRange extends DateRange {
    accountId?: string;
    accountVersion?: number;
}

export interface UsePaginatedObservableOptions<T, E = T> {
    /** Number of items per page */
    pageSize: number;
    /** Optional date range filter */
    dateRange?: AccountDateRange;
    /** Optional search query filter */
    searchQuery?: string;
    /** Factory function to create the observable */
    observe: (limit: number, dateRange?: AccountDateRange, searchQuery?: string) => Observable<T[]>;
    /** Optional enrichment function to transform raw items */
    enrich?: (items: T[], limit: number, dateRange?: AccountDateRange, searchQuery?: string) => Promise<E[]>;
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

export function usePaginatedObservable<T, E = T>(
    options: UsePaginatedObservableOptions<T, E>
): UsePaginatedObservableResult<E> {
    const { pageSize, dateRange, searchQuery, observe, enrich } = options;

    const [items, setItems] = useState<E[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [currentLimit, setCurrentLimit] = useState(pageSize);
    const [version, setVersion] = useState(0);
    const [error, setError] = useState<Error | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    // Stable key for structural filters (excluding version) to determine when to reset the list
    const structuralKey = useMemo(
        () => {
            const rangePart = dateRange
                ? `${dateRange.startDate}-${dateRange.endDate}-${dateRange.accountId || ''}`
                : 'none';
            return `${rangePart}-${searchQuery || ''}`;
        },
        [dateRange, searchQuery]
    );

    // Version key for re-fetching without clearing
    const versionKey = dateRange?.accountVersion || 0;

    // Combined key for effect dependency
    const effectKey = `${structuralKey}-${versionKey}`;

    // Track previous filter inputs to detect filter changes vs pagination
    const prevFilterRef = useRef({
        structuralKey,
        versionKey,
        observe,
        enrich,
        pageSize
    });

    useEffect(() => {
        let isActive = true;
        let sequence = 0;

        const prev = prevFilterRef.current;
        const isStructuralChange = prev.structuralKey !== structuralKey || prev.observe !== observe || prev.enrich !== enrich || prev.pageSize !== pageSize;
        const isVersionChange = prev.versionKey !== versionKey;

        if (isStructuralChange) {
            setIsLoading(true);
            setItems([]); // Clear items only on structural changes
            prevFilterRef.current = { structuralKey, versionKey, observe, enrich, pageSize };
            if (currentLimit !== pageSize) {
                setCurrentLimit(pageSize); // Reset pagination
                return;
            }
        } else if (isVersionChange) {
            setIsLoading(true);
            // Do NOT clear items for version changes, just re-fetch
            prevFilterRef.current = { structuralKey, versionKey, observe, enrich, pageSize };
        }

        const observable = observe(currentLimit, dateRange, searchQuery);

        const subscription = observable.subscribe(async (loaded) => {
            const current = ++sequence;
            try {
                if (enrich) {
                    const enriched = await enrich(loaded, currentLimit, dateRange, searchQuery);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLimit, effectKey, observe, enrich, pageSize, retryKey]);

    const loadMore = () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        setCurrentLimit(prev => prev + pageSize);
    };

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
