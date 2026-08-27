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
import { DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Observable } from 'rxjs';
import { useDependencyRevision } from '@/src/hooks/useDependencyRevision';

export interface UseObservableResult<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
  version: number;
}

function isPlaceholderInitial(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (value instanceof Map && value.size === 0) return true;
  if (value instanceof Set && value.size === 0) return true;
  return false;
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
 * @param initialValue - Initial value for the data OR a factory function to compute it (e.g. from cache)
 * @param options - Additional options
 */
export function useObservable<T>(
  observableFactory: () => Observable<T>,
  deps: DependencyList,
  initialValue: T | (() => T),
  options: UseObservableOptions<T> = {},
): UseObservableResult<T> {
  const factoryRef = useRef(observableFactory);
  useLayoutEffect(() => {
    factoryRef.current = observableFactory;
  });

  const stableFactory = useCallback(() => factoryRef.current(), []);

  // Compute the absolute initial value (handles factory functions for cache lookups)
  const [resolvedInitialValue] = useState<T>(() => {
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  });

  const [data, setData] = useState<T>(resolvedInitialValue);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });

  // If we have a non-null initial value (cache hit), we are not "loading" the first frame.
  // Standard initial values like empty arrays [], empty maps/sets, or null/undefined are treated as loading.
  const [isLoading, setIsLoading] = useState(() => isPlaceholderInitial(resolvedInitialValue));
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  // Track options in a ref to keep them out of the dependency array safely
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const depsRevision = useDependencyRevision(deps, () => setError(null));

  useEffect(() => {
    let isActive = true;
    const { keepPreviousData = true, comparator } = optionsRef.current;

    if (!keepPreviousData) {
      setData(resolvedInitialValue);
      setIsLoading(true);
    } else if (
      dataRef.current === resolvedInitialValue &&
      isPlaceholderInitial(resolvedInitialValue)
    ) {
      setIsLoading(true);
    }

    const subscription = stableFactory().subscribe({
      next: result => {
        if (!isActive) return;

        if (comparator && comparator(dataRef.current, result)) {
          setIsLoading(false);
          return;
        }

        dataRef.current = result;
        setData(result);
        setError(null);
        setVersion(v => v + 1);
        setIsLoading(false);
      },
      error: err => {
        if (!isActive) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [stableFactory, depsRevision, resolvedInitialValue]);

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
  options: UseObservableOptions<E> = {},
): UseObservableResult<E> {
  const factoryRef = useRef(observableFactory);
  const enricherRef = useRef(enricher);
  useLayoutEffect(() => {
    factoryRef.current = observableFactory;
    enricherRef.current = enricher;
  });

  const stableFactory = useCallback(() => factoryRef.current(), []);
  const stableEnricher = useCallback((d: T) => enricherRef.current(d), []);

  const [data, setData] = useState<E>(initialValue);
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  // Track refs to keep them out of the dependency array safely
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  // We capture the initial seed only once to use as a baseline for resets
  const initialSeedRef = useRef(initialValue);

  const depsRevision = useDependencyRevision(deps);

  useEffect(() => {
    let isActive = true;
    let sequence = 0;
    const { keepPreviousData = true, comparator } = optionsRef.current;

    if (!keepPreviousData) {
      setData(initialSeedRef.current);
      setIsLoading(true);
    } else if (dataRef.current === initialSeedRef.current) {
      setIsLoading(true);
    }

    // Reset error state
    setError(null);

    const subscription = stableFactory().subscribe({
      next: async result => {
        const current = ++sequence;
        try {
          const enriched = await stableEnricher(result);
          if (!isActive || current !== sequence) return;

          if (comparator && comparator(dataRef.current, enriched)) {
            setIsLoading(false);
            return;
          }

          dataRef.current = enriched;
          setData(enriched);
          setVersion(v => v + 1);
          setIsLoading(false);
        } catch (err) {
          if (!isActive || current !== sequence) return;
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      },
      error: err => {
        if (!isActive) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [stableFactory, stableEnricher, depsRevision]); // data, keepPreviousData, and comparator removed Log)

  return { data, isLoading, error, version };
}
