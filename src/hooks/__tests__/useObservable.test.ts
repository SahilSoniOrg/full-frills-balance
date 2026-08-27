import { useObservable, useObservableWithEnrichment } from '@/src/hooks/useObservable';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { BehaviorSubject, Subject } from 'rxjs';
import { WorkplaceId } from '@/src/types/ids';

describe('useObservable', () => {
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

  it('should not update data when comparator returns true', async () => {
    const subject = new Subject<string>();
    const comparator = (prev: string, next: string) => prev.toLowerCase() === next.toLowerCase();

    const { result } = renderHook(() =>
      useObservable(() => subject, [], 'Initial', { comparator }),
    );

    act(() => {
      subject.next('initial'); // Same as 'Initial' (case-insensitive)
    });

    // Data should NOT update to 'initial' because comparator returns true
    await waitFor(() => {
      expect(result.current.data).toBe('Initial');
    });

    act(() => {
      subject.next('Updated');
    });

    // Data SHOULD update to 'Updated' because comparator returns false
    await waitFor(() => {
      expect(result.current.data).toBe('Updated');
    });
  });

  it('should handle rapid synchronous emissions correctly with comparator', async () => {
    const subject = new Subject<string>();
    const comparator = (prev: string, next: string) => prev.toLowerCase() === next.toLowerCase();

    const { result } = renderHook(() =>
      useObservable(() => subject, [], 'Initial', { comparator }),
    );

    act(() => {
      subject.next('Updated');
      subject.next('updated'); // Synchronous second emission, should be skipped because of immediately-updated ref
    });

    await waitFor(() => {
      expect(result.current.data).toBe('Updated');
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
});
