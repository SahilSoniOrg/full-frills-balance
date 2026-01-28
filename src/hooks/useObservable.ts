/**
 * useObservable - Generic hook for observable subscriptions
 *
 * Encapsulates the common pattern of:
 * - Subscribing to an observable on mount
 * - Updating local state when observable emits
 * - Unsubscribing on unmount
 * - Managing loading state
 */
import { DependencyList, useEffect, useState } from 'react';
import { Observable } from 'rxjs';

export interface UseObservableResult<T> {
    data: T;
    isLoading: boolean;
    error: Error | null;
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

    const [data, setData] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!keepPreviousData) {
            setData(initialValue);
        }
        setIsLoading(true);
        setError(null);

        const subscription = observableFactory().subscribe({
            next: (result) => {
                setData(result);
                setIsLoading(false);
            },
            error: (err) => {
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            },
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { data, isLoading, error };
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
    const [data, setData] = useState<E>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);

        const subscription = observableFactory().subscribe({
            next: async (result) => {
                try {
                    const enriched = await enricher(result);
                    setData(enriched);
                    setIsLoading(false);
                } catch (err) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                }
            },
            error: (err) => {
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            },
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { data, isLoading, error };
}
