/**
 * useObservable - Generic hook for observable subscriptions
 *
 * Encapsulates the common pattern of:
 * - Subscribing to an observable on mount
 * - Updating local state when observable emits
 * - Unsubscribing on unmount
 * - Managing loading state
 * - Versioning to force re-renders on same-reference emissions
 *
 * NOTE: For WatermelonDB Models, the 'data' reference will remain stable across updates.
 * If passing 'data' to React.memo components, you MUST pass 'version' as a prop or key
 * to ensure re-rendering.
 */
import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { Observable } from 'rxjs';

export interface UseObservableResult<T> {
    data: T;
    isLoading: boolean;
    error: Error | null;
    version: number;
}

export interface UseObservableOptions<T> {
    /** Keep previous data while loading new data */
    keepPreviousData?: boolean;
    /** Optional comparator to prevent re-renders when data hasn't changed */
    comparator?: (prev: T, next: T) => boolean;
}

/**
 * Hook to subscribe to an observable and manage its state
 *
 * @param observableFactory - Factory function that returns the observable
 * @param deps - Dependencies for the observable factory
 * @param initialValue - Initial value for the data
 * @param options - Additional options
 */
export function useObservable<T>(
    observableFactory: () => Observable<T>,
    deps: DependencyList,
    initialValue: T,
    options: UseObservableOptions<T> = {}
): UseObservableResult<T> {
    const { keepPreviousData = true } = options;

    const factoryRef = useRef(observableFactory);
    factoryRef.current = observableFactory;

    const stableFactory = useCallback(() => factoryRef.current(), []);

    const [data, setData] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let isActive = true;
        const { comparator } = options;

        if (!keepPreviousData) {
            setData(initialValue);
        }

        // Only show loading if we don't have data yet or we're not keeping previous data
        if (!keepPreviousData || (initialValue !== undefined && data === initialValue)) {
            setIsLoading(true);
        }
        setError(null);

        const subscription = stableFactory().subscribe({
            next: (result) => {
                if (!isActive) return;

                // Apply comparator if provided to avoid redundant updates
                if (comparator && comparator(data, result)) {
                    setIsLoading(false);
                    return;
                }

                setData(result);
                setVersion(v => v + 1);
                setIsLoading(false);
            },
            error: (err) => {
                if (!isActive) return;
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            },
        });

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stableFactory, keepPreviousData, ...deps]);

    return { data, isLoading, error, version };
}

/**
 * Hook to subscribe to an observable with optional async enrichment
 *
 * Useful when the observable provides raw data that needs to be enriched
 * with additional information from async operations.
 *
 * @param observableFactory - Factory function that returns the observable
 * @param enricher - Async function to enrich the data
 * @param deps - Dependencies for effect re-runs
 * @param initialValue - Initial value for the data
 */
export function useObservableWithEnrichment<T, E>(
    observableFactory: () => Observable<T>,
    enricher: (data: T) => Promise<E>,
    deps: DependencyList,
    initialValue: E,
    options: UseObservableOptions<E> = {}
): UseObservableResult<E> {
    const factoryRef = useRef(observableFactory);
    factoryRef.current = observableFactory;

    const enricherRef = useRef(enricher);
    enricherRef.current = enricher;

    const stableFactory = useCallback(() => factoryRef.current(), []);
    const stableEnricher = useCallback((d: T) => enricherRef.current(d), []);

    const [data, setData] = useState<E>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let isActive = true;
        let sequence = 0;
        const { keepPreviousData = true, comparator } = options as UseObservableOptions<E>;

        if (!keepPreviousData) {
            setData(initialValue);
        }

        if (!keepPreviousData || data === initialValue) {
            setIsLoading(true);
        }
        setError(null);

        const subscription = stableFactory().subscribe({
            next: async (result) => {
                const current = ++sequence;
                try {
                    const enriched = await stableEnricher(result);
                    if (!isActive || current !== sequence) return;

                    if (comparator && comparator(data, enriched)) {
                        setIsLoading(false);
                        return;
                    }

                    setData(enriched);
                    setVersion(v => v + 1);
                    setIsLoading(false);
                } catch (err) {
                    if (!isActive || current !== sequence) return;
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                }
            },
            error: (err) => {
                if (!isActive) return;
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            },
        });

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stableFactory, stableEnricher, ...deps]);

    return { data, isLoading, error, version };
}
