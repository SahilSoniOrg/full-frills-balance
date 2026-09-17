import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { renderHook } from '@testing-library/react-native';
import { LayoutAnimation } from 'react-native';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('useEaseInLayoutAnimation', () => {
  const configureNext = jest.spyOn(LayoutAnimation, 'configureNext');

  beforeEach(() => {
    configureNext.mockClear();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterAll(() => {
    configureNext.mockRestore();
  });

  it('configures ease-in/out when motion is allowed', () => {
    const { result } = renderHook(() => useEaseInLayoutAnimation());
    result.current();
    expect(configureNext).toHaveBeenCalledWith(LayoutAnimation.Presets.easeInEaseOut);
  });

  it('skips animation when reduce motion is on', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = renderHook(() => useEaseInLayoutAnimation());
    result.current();
    expect(configureNext).not.toHaveBeenCalled();
  });
});
