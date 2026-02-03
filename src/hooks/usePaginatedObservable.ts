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

export interface UsePaginatedObservableOptions<T, E = T> {
    /** Number of items per page */
    pageSize: number;
    /** Optional date range filter */
    dateRange?: DateRange;
    /** Factory function to create the observable */
    observe: (limit: number, dateRange?: DateRange) => Observable<T[]>;
    /** Optional enrichment function to transform raw items */
    enrich?: (items: T[], limit: number, dateRange?: DateRange) => Promise<E[]>;
}

export interface UsePaginatedObservableResult<E> {
    items: E[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    loadMore: () => void;
    version: number;
}

export function usePaginatedObservable<T, E = T>(
    options: UsePaginatedObservableOptions<T, E>
): UsePaginatedObservableResult<E> {
    const { pageSize, dateRange, observe, enrich } = options;

    const [items, setItems] = useState<E[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [currentLimit, setCurrentLimit] = useState(pageSize);
    const [version, setVersion] = useState(0);

    // Stable key for dateRange to avoid unnecessary effect re-runs
    const dateRangeKey = useMemo(
        () => dateRange ? `${dateRange.startDate}-${dateRange.endDate}-${(dateRange as any).accountId || ''}-${(dateRange as any).accountVersion || ''}` : 'none',
        [dateRange]
    );

    // Track previous dateRangeKey to detect filter changes vs pagination
    const prevDateRangeKeyRef = useRef(dateRangeKey);

    useEffect(() => {
        let isActive = true;
        let sequence = 0;

        // Only show full loading state when date range changes (not on pagination)
        const isFilterChange = prevDateRangeKeyRef.current !== dateRangeKey;
        if (isFilterChange) {
            setIsLoading(true);
            setCurrentLimit(pageSize); // Reset pagination
            prevDateRangeKeyRef.current = dateRangeKey;
        }

        const observable = observe(currentLimit, dateRange);

        const subscription = observable.subscribe(async (loaded) => {
            const current = ++sequence;
            try {
                if (enrich) {
                    const enriched = await enrich(loaded, currentLimit, dateRange);
                    if (!isActive || current !== sequence) return;
                    setItems(enriched as E[]);
                } else {
                    if (!isActive || current !== sequence) return;
                    setItems(loaded as unknown as E[]);
                }
                setHasMore(loaded.length >= currentLimit);
                setVersion(v => v + 1);
                setIsLoading(false);
                setIsLoadingMore(false);
            } catch {
                if (!isActive || current !== sequence) return;
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        });

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLimit, dateRangeKey]);

    const loadMore = () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        setCurrentLimit(prev => prev + pageSize);
    };

    return { items, isLoading, isLoadingMore, hasMore, loadMore, version };
}
