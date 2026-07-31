import { act, renderHook } from '@testing-library/react-native';
import { useScreenPrivacyMode } from '../useScreenPrivacyMode';

describe('useScreenPrivacyMode', () => {
  it('mirrors global privacy mode when there is no override', () => {
    const { result, rerender } = renderHook(
      ({ globalPrivacyMode }) => useScreenPrivacyMode(globalPrivacyMode),
      { initialProps: { globalPrivacyMode: false } },
    );

    expect(result.current.isPrivacyMode).toBe(false);

    rerender({ globalPrivacyMode: true });
    expect(result.current.isPrivacyMode).toBe(true);
  });

  it('toggles relative to the effective privacy value', () => {
    const { result } = renderHook(() => useScreenPrivacyMode(false));

    expect(result.current.isPrivacyMode).toBe(false);

    act(() => {
      result.current.togglePrivacyMode();
    });
    expect(result.current.isPrivacyMode).toBe(true);

    act(() => {
      result.current.togglePrivacyMode();
    });
    expect(result.current.isPrivacyMode).toBe(false);
  });

  it('does not clear override when global privacy mode changes', () => {
    const { result, rerender } = renderHook(
      ({ globalPrivacyMode }) => useScreenPrivacyMode(globalPrivacyMode),
      { initialProps: { globalPrivacyMode: false } },
    );

    act(() => {
      result.current.togglePrivacyMode();
    });
    expect(result.current.isPrivacyMode).toBe(true);

    rerender({ globalPrivacyMode: true });
    expect(result.current.isPrivacyMode).toBe(true);

    rerender({ globalPrivacyMode: false });
    expect(result.current.isPrivacyMode).toBe(true);
  });

  it('keeps override when global catches up to the overridden value', () => {
    const { result, rerender } = renderHook(
      ({ globalPrivacyMode }) => useScreenPrivacyMode(globalPrivacyMode),
      { initialProps: { globalPrivacyMode: true } },
    );

    act(() => {
      result.current.togglePrivacyMode();
    });
    expect(result.current.isPrivacyMode).toBe(false);

    // Global flips to match override; override must remain so a later global
    // change does not yank the screen back.
    rerender({ globalPrivacyMode: false });
    expect(result.current.isPrivacyMode).toBe(false);

    rerender({ globalPrivacyMode: true });
    expect(result.current.isPrivacyMode).toBe(false);
  });
});
