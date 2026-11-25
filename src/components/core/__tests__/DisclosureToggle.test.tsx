import { DisclosureToggle } from '@/src/components/core/DisclosureToggle';
import { fireEvent, render, screen } from '@/src/testing/render';
import { Text } from 'react-native';

describe('DisclosureToggle', () => {
  it('toggles on press and supports long-press plus custom trailing', () => {
    const onToggle = jest.fn();
    const onLongPress = jest.fn();
    render(
      <DisclosureToggle
        label="Assets"
        meta={3}
        expanded={false}
        onToggle={onToggle}
        onLongPress={onLongPress}
        trailing={<Text>Select</Text>}
        testID="disclosure"
      />,
    );

    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Select')).toBeTruthy();
    fireEvent.press(screen.getByTestId('disclosure'));
    expect(onToggle).toHaveBeenCalled();
    fireEvent(screen.getByTestId('disclosure'), 'longPress');
    expect(onLongPress).toHaveBeenCalled();
  });
});
