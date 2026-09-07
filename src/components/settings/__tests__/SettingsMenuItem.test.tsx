import { SettingsMenuItem } from '@/src/components/settings/SettingsMenuItem';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

describe('SettingsMenuItem', () => {
  it('keeps native press events behind its no-argument callback contract', () => {
    const onPress = jest.fn();

    render(<SettingsMenuItem title="Appearance" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'), { nativeEvent: { target: 42 } });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith();
  });
});
