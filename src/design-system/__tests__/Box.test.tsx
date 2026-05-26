import { Box } from '@/src/design-system/Box';
import { render, screen } from '@/src/utils/test-utils';
import { Pressable } from 'react-native';

describe('Box', () => {
  it('preserves Pressable callback styles', () => {
    const pressableStyle = jest.fn(({ pressed }) => ({ opacity: pressed ? 0.5 : 1 }));

    render(
      <Box as={Pressable} testID="pressable-box" style={pressableStyle}>
        child
      </Box>,
    );

    const pressable = screen.getByTestId('pressable-box');

    expect(pressableStyle).toHaveBeenCalled();
    expect(pressable.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 1 })]),
    );
  });
});
