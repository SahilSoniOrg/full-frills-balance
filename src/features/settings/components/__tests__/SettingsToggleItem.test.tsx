import { SettingsToggleItem } from '@/src/features/settings/components/SettingsToggleItem';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

describe('SettingsToggleItem', () => {
  it('labels the switch and emits the next boolean value', () => {
    const onValueChange = jest.fn();

    render(
      <SettingsToggleItem
        searchId="privacy-security"
        title="Hide balances"
        value={false}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.press(screen.getByRole('switch', { name: 'Hide balances' }));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
