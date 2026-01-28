/**
 * usePaginatedObservable - Generic hook for paginated observable data with enrichment
 *
 * Encapsulates common pagination logic:
 * - Pagination state management (currentLimit, hasMore, isLoadingMore)
 * - Date range key memoization for filter changes
 * - Filter change detection via refs (avoids full reload on pagination)
 * - Observable subscription lifecycle
 * - loadMore function
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
    /** Optional secondary observable for triggering re-enrichment (e.g., transactions) */
    secondaryObserve?: () => Observable<unknown>;
}

export interface UsePaginatedObservableResult<E> {
    items: E[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    loadMore: () => void;
}

export function usePaginatedObservable<T, E = T>(
    options: UsePaginatedObservableOptions<T, E>
): UsePaginatedObservableResult<E> {
    const { pageSize, dateRange, observe, enrich, secondaryObserve } = options;

    const [items, setItems] = useState<E[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [currentLimit, setCurrentLimit] = useState(pageSize);

    // Stable key for dateRange to avoid unnecessary effect re-runs
    const dateRangeKey = useMemo(
        () => dateRange ? `${dateRange.startDate}-${dateRange.endDate}` : 'none',
        [dateRange]
    );

    // Track previous dateRangeKey to detect filter changes vs pagination
    const prevDateRangeKeyRef = useRef(dateRangeKey);

    useEffect(() => {
        // Only show full loading state when date range changes (not on pagination)
        const isFilterChange = prevDateRangeKeyRef.current !== dateRangeKey;
        if (isFilterChange) {
            setIsLoading(true);
            setCurrentLimit(pageSize); // Reset pagination on filter change
            prevDateRangeKeyRef.current = dateRangeKey;
        }

        const observable = observe(currentLimit, dateRange);

        const subscription = observable.subscribe(async (loaded) => {
            if (enrich) {
                const enriched = await enrich(loaded, currentLimit, dateRange);
                setItems(enriched as E[]);
            } else {
                setItems(loaded as unknown as E[]);
            }
            setHasMore(loaded.length >= currentLimit);
            setIsLoading(false);
            setIsLoadingMore(false);
        });

        // Secondary subscription for re-enrichment (e.g., when transactions change)
        let secondarySubscription: { unsubscribe: () => void } | undefined;
        if (secondaryObserve && enrich) {
            secondarySubscription = secondaryObserve().subscribe(async () => {
                // Re-fetch enriched data when secondary observable fires
                // Use firstValueFrom-style pattern with proper cleanup
                const primaryData = await new Promise<T[]>((resolve) => {
                    const innerSub = observe(currentLimit, dateRange).subscribe((data) => {
                        resolve(data);
                        // Defer unsubscribe to next tick to avoid reference before initialization
                        setTimeout(() => innerSub.unsubscribe(), 0);
                    });
                });
                const enriched = await enrich(primaryData, currentLimit, dateRange);
                setItems(enriched as E[]);
            });
        }

        return () => {
            subscription.unsubscribe();
            secondarySubscription?.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLimit, dateRangeKey]);

    const loadMore = () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        setCurrentLimit(prev => prev + pageSize);
    };

    return { items, isLoading, isLoadingMore, hasMore, loadMore };
}
