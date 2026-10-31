import { useAnimatedStyle } from 'react-native-reanimated';

describe('shared animation mock', () => {
  it('evaluates animated styles and surfaces callback errors', () => {
    expect(useAnimatedStyle(() => ({ opacity: 0.5 }))).toEqual({ opacity: 0.5 });
    expect(() =>
      useAnimatedStyle(() => {
        throw new Error('animated style failed');
      }),
    ).toThrow('animated style failed');
  });
});
