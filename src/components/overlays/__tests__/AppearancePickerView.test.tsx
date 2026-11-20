import { Icon } from '@/src/components/core';
import { AppearancePickerView } from '@/src/components/overlays/AppearancePickerView';
import { fireEvent, render } from '@/src/testing/render';

describe('AppearancePickerView', () => {
  it('saves both icon and color from Done', () => {
    const onSave = jest.fn();
    const { getByText, getByLabelText } = render(
      <AppearancePickerView
        mode="both"
        selectedIcon={Icon.Wallet}
        selectedColor=""
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.press(getByLabelText(`Select icon ${Icon.Bank}`));
    fireEvent.press(getByText('Done'));

    expect(onSave).toHaveBeenCalledWith({ icon: Icon.Bank, color: '' });
  });

  it('selects an icon in icon-only mode and closes', async () => {
    const onIconSelect = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <AppearancePickerView
        mode="icon"
        selectedIcon={Icon.Wallet}
        onClose={onClose}
        onIconSelect={onIconSelect}
      />,
    );

    fireEvent.press(getByLabelText(`Select icon ${Icon.Bank}`));
    await Promise.resolve();

    expect(onIconSelect).toHaveBeenCalledWith(Icon.Bank);
    expect(onClose).toHaveBeenCalled();
  });
});
