import { ThemeIds } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { fireEvent, render } from '@/src/testing/render';
import { SubmitFooter } from '../SubmitFooter';

jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: () => ({ isKeyboardVisible: false }),
}));

describe('SubmitFooter', () => {
  it('shows requirement hint only after a save attempt', () => {
    const screen = render(
      <ThemeOverride mode="light" themeId={ThemeIds.DEEP_SPACE}>
        <SubmitFooter
          onPress={() => {}}
          label="Save budget"
          disabled
          requirementHint="Choose a category"
        />
      </ThemeOverride>,
    );

    expect(screen.queryByText('Choose a category')).toBeNull();
    fireEvent.press(screen.getByText('Save budget'));
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.getByTestId('submit-footer-button').props.accessibilityState.disabled).toBe(true);
  });

  it('leaves an enabled button enabled, wrapper included', () => {
    const onPress = jest.fn();
    const screen = render(
      <ThemeOverride mode="light" themeId={ThemeIds.DEEP_SPACE}>
        <SubmitFooter
          onPress={onPress}
          label="Save budget"
          disabled={false}
          requirementHint="Choose a category"
        />
      </ThemeOverride>,
    );

    expect(screen.getByTestId('submit-footer-button')).toBeEnabled();
    fireEvent.press(screen.getByTestId('submit-footer-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Choose a category')).toBeNull();
  });
});
