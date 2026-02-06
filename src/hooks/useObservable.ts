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

export interface UseObservableOptions {
    /** Keep previous data while loading new data */
    keepPreviousData?: boolean;
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
    options: UseObservableOptions = {}
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
        if (!keepPreviousData) {
            setData(initialValue);
        }
        setIsLoading(true);
        setError(null);

        const subscription = stableFactory().subscribe({
            next: (result) => {
                if (!isActive) return;
                // For arrays, always create a new reference to ensure React notices the change
                // even if the contents are identical (identity persistence in WatermelonDB)
                setData(Array.isArray(result) ? [...result] : result as any);
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
    }, [stableFactory, ...deps]);

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
    initialValue: E
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
        setIsLoading(true);
        setError(null);

        const subscription = stableFactory().subscribe({
            next: async (result) => {
                const current = ++sequence;
                try {
                    const enriched = await stableEnricher(result);
                    if (!isActive || current !== sequence) return;
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
    }, [stableFactory, ...deps]);

    return { data, isLoading, error, version };
}
