import { areDependencyListsEqual, useDependencyRevision } from '@/src/hooks/useDependencyRevision';
import { act, renderHook } from '@testing-library/react-native';

describe('areDependencyListsEqual', () => {
  it('compares by slot reference', () => {
    const a = [1, 'x'];
    expect(areDependencyListsEqual(a, [1, 'x'])).toBe(true);
    expect(areDependencyListsEqual(a, [2, 'x'])).toBe(false);
    expect(areDependencyListsEqual(a, [1])).toBe(false);
  });
});

describe('useDependencyRevision', () => {
  it('starts at 0 and bumps when deps change', () => {
    const onRevision = jest.fn();
    const { result, rerender } = renderHook(
      ({ deps }: { deps: unknown[] }) => useDependencyRevision(deps, onRevision),
      { initialProps: { deps: [1] } },
    );

    expect(result.current).toBe(0);
    expect(onRevision).not.toHaveBeenCalled();

    rerender({ deps: [2] });

    expect(result.current).toBe(1);
    expect(onRevision).toHaveBeenCalledTimes(1);

    rerender({ deps: [2] });
    expect(result.current).toBe(1);
  });

  it('bumps again on subsequent dep changes', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: unknown[] }) => useDependencyRevision(deps),
      { initialProps: { deps: ['a'] } },
    );

    rerender({ deps: ['b'] });
    act(() => {});
    expect(result.current).toBe(1);

    rerender({ deps: ['c'] });
    act(() => {});
    expect(result.current).toBe(2);
  });
});
