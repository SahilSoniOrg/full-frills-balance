import { usePressScale, PRESS_SCALE } from '@/src/hooks/usePressScale';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('usePressScale', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('animates to press scale on press in and back on press out', () => {
    const { result } = renderHook(() => usePressScale());

    expect(result.current.animate.scale).toBe(1);

    act(() => {
      result.current.handlePressIn();
    });
    expect(result.current.animate.scale).toBe(PRESS_SCALE);
    expect(result.current.transition.duration).toBe(100);

    act(() => {
      result.current.handlePressOut();
    });
    expect(result.current.animate.scale).toBe(1);
    expect(result.current.transition.duration).toBe(150);
  });

  it('skips scale animation when reduced motion is enabled', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = renderHook(() => usePressScale());

    act(() => {
      result.current.handlePressIn();
    });

    expect(result.current.animate.scale).toBe(1);
  });
});
