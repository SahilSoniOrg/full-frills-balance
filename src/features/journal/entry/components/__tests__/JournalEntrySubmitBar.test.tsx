import { fireEvent, render } from '@/src/utils/test-utils';
import { JournalEntrySubmitBar } from '../JournalEntrySubmitBar';

jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: () => ({ isKeyboardVisible: false }),
}));

describe('JournalEntrySubmitBar', () => {
  it('shows the missing-requirement hint only after a save attempt', () => {
    const onPress = jest.fn();
    const screen = render(
      <JournalEntrySubmitBar
        onPress={onPress}
        label="Save"
        disabled
        missingRequirementHint="Enter an amount greater than zero."
      />,
    );

    expect(screen.queryByText('Enter an amount greater than zero.')).toBeNull();
    fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Enter an amount greater than zero.')).toBeTruthy();
    expect(onPress).not.toHaveBeenCalled();
  });
});
