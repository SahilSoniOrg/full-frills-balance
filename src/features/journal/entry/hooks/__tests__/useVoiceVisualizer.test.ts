import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useVoiceVisualizer } from '../useVoiceVisualizer';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(),
}));

describe('useVoiceVisualizer', () => {
  it('does not start waveform animations when reduced motion is enabled', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const springSpy = jest.spyOn(Animated, 'spring');
    const loopSpy = jest.spyOn(Animated, 'loop');

    const { result } = renderHook(() => useVoiceVisualizer());
    act(() => result.current.setRecording(true));

    expect(springSpy).not.toHaveBeenCalled();
    expect(loopSpy).not.toHaveBeenCalled();

    springSpy.mockRestore();
    loopSpy.mockRestore();
  });
});
