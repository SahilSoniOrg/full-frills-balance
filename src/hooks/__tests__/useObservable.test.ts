import {
  useObservable,
  useObservableWithEnrichment,
  useWorkplaceObservable,
  type UseObservableResult,
} from '@/src/hooks/useObservable';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BehaviorSubject, defer, EMPTY, of, Subject, throwError } from 'rxjs';
import { WorkplaceId } from '@/src/types/ids';

describe('useObservable', () => {
  it('uses the new workplace cache seed immediately and subscribes once per workplace', () => {
    const source = new Subject<string>();
    const factory = jest.fn(() => source);
    const seeds = jest.fn((workplace: string) => `${workplace} cache`);
    const frames: { workplace: string; data: string }[] = [];
    const { result, rerender } = renderHook(
      ({ workplace }: { workplace: string }) => {
        const value = useWorkplaceObservable(workplace, factory, [workplace], () =>
          seeds(workplace),
        );
        frames.push({ workplace, data: value.data });
        return value;
      },
      { initialProps: { workplace: 'one' } },
    );
    expect(factory).toHaveBeenCalledTimes(1);
    rerender({ workplace: 'two' });
    expect(result.current.data).toBe('two cache');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(
      frames.filter(frame => frame.workplace === 'two').every(frame => frame.data === 'two cache'),
    ).toBe(true);
    expect(seeds.mock.calls.map(([workplace]) => workplace)).toEqual(['one', 'two']);
  });

  it('resets workplace identity even when the caller omits it from refresh dependencies', () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    const { result, rerender } = renderHook(
      ({ workplace }: { workplace: string }) =>
        useWorkplaceObservable(
          workplace,
          () => (workplace === 'one' ? first : second),
          [],
          null as string | null,
        ),
      { initialProps: { workplace: 'one' } },
    );
    act(() => first.next('first row'));
    rerender({ workplace: 'two' });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(first.observed).toBe(false);
    expect(second.observed).toBe(true);
  });

  it('clears on workplace changes, ignores old source emissions, and retains data on same-workplace refresh', async () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    let source = first;
    const { result, rerender } = renderHook(
      ({ workplace, refresh }: { workplace: string; refresh: number }) =>
        useWorkplaceObservable(
          workplace,
          () => source,
          [workplace, refresh],
          null as string | null,
        ),
      { initialProps: { workplace: 'one', refresh: 0 } },
    );

    act(() => first.next('first workplace row'));
    await waitFor(() => expect(result.current.data).toBe('first workplace row'));

    rerender({ workplace: 'one', refresh: 1 });
    expect(result.current.data).toBe('first workplace row');
    expect(first.observed).toBe(true);

    source = second;
    rerender({ workplace: 'two', refresh: 0 });
    expect(result.current.data).toBeNull();
    act(() => first.next('stale row'));
    expect(result.current.data).toBeNull();
    act(() => second.next('second workplace row'));
    await waitFor(() => expect(result.current.data).toBe('second workplace row'));
  });

  it('keeps mounted-screen data while paused and catches up when focused again', () => {
    const source = new BehaviorSubject(1);
    const { result, rerender, unmount } = renderHook<
      UseObservableResult<number>,
      { focused: boolean }
    >(({ focused }) => useObservable(() => (focused ? source : EMPTY), [focused], 0), {
      initialProps: { focused: true },
    });
    expect(result.current.data).toBe(1);

    rerender({ focused: false });
    expect(source.observed).toBe(false);
    const pausedVersion = result.current.version;
    act(() => source.next(2));
    expect(result.current.data).toBe(1);
    expect(result.current.version).toBe(pausedVersion);

    rerender({ focused: true });
    expect(source.observed).toBe(true);
    expect(result.current.data).toBe(2);
    unmount();
    expect(source.observed).toBe(false);
  });

  it('should return initial value immediately', () => {
    const subject = new BehaviorSubject('initial');
    const { result } = renderHook(() => useObservable(() => subject, [], 'default' as WorkplaceId));

    expect(result.current.data).toBe('initial');
    expect(result.current.isLoading).toBe(false);
  });

  it('should update data when observable emits', async () => {
    const subject = new Subject<string>();
    const { result } = renderHook(
      ({ f }: { f: () => BehaviorSubject<string> }) =>
        useObservable(f, [f], 'default' as WorkplaceId),
      {
        initialProps: { f: () => subject as any },
      },
    );

    expect(result.current.data).toBe('default' as WorkplaceId);

    act(() => {
      subject.next('updated');
    });

    await waitFor(() => {
      expect(result.current.data).toBe('updated');
    });
  });

  it('should handle errors', async () => {
    const subject = new Subject<string>();
    const { result } = renderHook(
      ({ f }: { f: () => BehaviorSubject<string> }) =>
        useObservable(f, [f], 'default' as WorkplaceId),
      {
        initialProps: { f: () => subject as any },
      },
    );

    const error = new Error('Test error');

    act(() => {
      subject.error(error);
    });

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should retry a failed subscription', async () => {
    let attempts = 0;
    const { result } = renderHook(() =>
      useObservable(
        () =>
          defer(() => {
            attempts += 1;
            return attempts === 1 ? throwError(() => new Error('Test error')) : of('recovered');
          }),
        [],
        'default',
      ),
    );

    await waitFor(() => expect(result.current.error).toEqual(new Error('Test error')));

    act(() => result.current.retry());

    await waitFor(() => {
      expect(result.current.data).toBe('recovered');
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
    expect(attempts).toBe(2);
  });

  it('should unsubscribe on unmount', () => {
    const subject = new Subject<string>();
    // Spy on behavior to verify unsubscription if possible,
    // usually we trust the effect cleanup, but we can check if data stops updating
    const { unmount } = renderHook(
      ({ f }: { f: () => BehaviorSubject<string> }) =>
        useObservable(f, [f], 'default' as WorkplaceId),
      {
        initialProps: { f: () => subject as any },
      },
    );

    unmount();
    subject.next('after unmount');

    // Logic check: React state updates on unmounted component usually warn,
    // but since we unmounted, we can't check 'result' for subsequent updates easily without validation.
    // A better check is to see if the observable has observers.
    expect(subject.observers.length).toBe(0);
  });

  it('should respect keepPreviousData=false', async () => {
    const subject1 = new BehaviorSubject('A');
    const subject2 = new BehaviorSubject('B');

    let factory = () => subject1;
    const { result, rerender } = renderHook(
      ({ f }: { f: () => BehaviorSubject<string> }) =>
        useObservable(f, [f], 'init', { keepPreviousData: false }),
      { initialProps: { f: factory } },
    );

    expect(result.current.data).toBe('A');

    // Switch factory
    factory = () => subject2;
    rerender({ f: factory });

    // Since keepPreviousData is false, it should potentially reset to init momentarily if implemented that way,
    // or just switch validation.
    // useObservable implementation:
    // if (!keepPreviousData) setData(initialValue);
    // So we expect it to flash 'init' if synchronous, or 'B' if immediate.
    // With BehaviorSubject, it might be immediate.

    expect(result.current.data).toBe('B');
  });

  it('resubscribes when deps change', async () => {
    const subject1 = new BehaviorSubject('A');
    const subject2 = new BehaviorSubject('B');
    let factory = () => subject1;
    const { result, rerender } = renderHook(
      ({ f, deps }: { f: () => BehaviorSubject<string>; deps: unknown[] }) =>
        useObservable(f, deps, 'init'),
      { initialProps: { f: factory, deps: [1] } },
    );

    expect(result.current.version).toBe(1);

    factory = () => subject2;
    rerender({ f: factory, deps: [2] });

    await waitFor(() => {
      expect(result.current.data).toBe('B');
      expect(result.current.version).toBe(2);
    });
  });

  it('keeps a cache-hit object from flipping back to loading on subscribe', async () => {
    const cached = { safeToSpend: 12 };
    const subject = new Subject<typeof cached>();
    const { result } = renderHook(() => useObservable(() => subject, [], cached));

    expect(result.current.data).toBe(cached);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      subject.next({ safeToSpend: 15 });
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ safeToSpend: 15 });
      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe('useObservableWithEnrichment', () => {
  it('should enrich data asynchronously', async () => {
    const subject = new BehaviorSubject('raw');
    const enricher = jest.fn().mockResolvedValue('enriched');

    const { result } = renderHook(() =>
      useObservableWithEnrichment(() => subject, enricher, [], 'loading'),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toBe('enriched');
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should handle enrichment errors', async () => {
    const subject = new BehaviorSubject('raw');
    const error = new Error('Enrich failed');
    const enricher = jest.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useObservableWithEnrichment(() => subject, enricher, [], 'loading'),
    );

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should retry enrichment after a failure', async () => {
    const subject = new BehaviorSubject('raw');
    let attempts = 0;
    const enricher = jest.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Enrich failed');
      return 'recovered';
    });

    const { result } = renderHook(() =>
      useObservableWithEnrichment(() => subject, enricher, [], 'loading'),
    );

    await waitFor(() => expect(result.current.error).toEqual(new Error('Enrich failed')));

    act(() => result.current.retry());

    await waitFor(() => {
      expect(result.current.data).toBe('recovered');
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
    expect(attempts).toBe(2);
  });
});
