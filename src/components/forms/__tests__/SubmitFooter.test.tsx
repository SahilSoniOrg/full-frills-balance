import { ThemeIds } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { render } from '@/src/utils/test-utils';
import { SubmitFooter } from '../SubmitFooter';

jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: () => ({ isKeyboardVisible: false }),
}));

describe('SubmitFooter', () => {
  it('shows requirement hint when disabled', () => {
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

    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.getByTestId('submit-footer-button').props.accessibilityState.disabled).toBe(
      true,
    );
  });
});
