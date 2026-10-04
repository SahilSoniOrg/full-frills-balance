import { StyleSheet, View } from 'react-native';
import { Shape, ThemeIds, getThemeColors } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { getContrastRatio, getLuminance } from '@/src/utils/color-math';
import { render } from '@/src/utils/test-utils';
import { SubmitFooter } from '../SubmitFooter';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: () => ({ isKeyboardVisible: false }),
}));

const contrast = (foreground: string, background: string) =>
  getContrastRatio(getLuminance(foreground), getLuminance(background));

describe('SubmitFooter button contrast', () => {
  it.each(['light', 'dark'] as const)('keeps disabled label readable in %s mode', mode => {
    const theme = getThemeColors(ThemeIds.DEEP_SPACE, mode);
    const screen = render(
      <ThemeOverride mode={mode} themeId={ThemeIds.DEEP_SPACE}>
        <SubmitFooter
          onPress={() => {}}
          label="Save budget"
          disabled
          requirementHint="Choose a category"
        />
      </ThemeOverride>,
    );
    const button = screen.getByTestId('submit-footer-button');
    const surface = screen.UNSAFE_getAllByType(View).find(node => {
      const style = StyleSheet.flatten(node.props.style);
      return (
        style?.backgroundColor === theme.surfaceSecondary &&
        style?.borderRadius === Shape.radius.full
      );
    });
    const label = screen.getByText('Save budget');
    const labelStyle = StyleSheet.flatten(label.props.style);

    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(surface).toBeTruthy();
    expect(labelStyle.color).toBe(theme.text);
    expect(labelStyle.opacity).toBeUndefined();
    expect(contrast(labelStyle.color, theme.surfaceSecondary)).toBeGreaterThanOrEqual(4.5);
    expect(screen.getByText('Choose a category')).toBeTruthy();
  });

  it.each(['light', 'dark'] as const)(
    'keeps the enabled mint pill and high-contrast label in %s mode',
    mode => {
      const theme = getThemeColors(ThemeIds.DEEP_SPACE, mode);
      const screen = render(
        <ThemeOverride mode={mode} themeId={ThemeIds.DEEP_SPACE}>
          <SubmitFooter onPress={() => {}} label="Save budget" disabled={false} />
        </ThemeOverride>,
      );
      const button = screen.getByTestId('submit-footer-button');
      const label = screen.getByText('Save budget');
      const labelStyle = StyleSheet.flatten(label.props.style);
      const surface = screen.UNSAFE_getAllByType(View).find(node => {
        const style = StyleSheet.flatten(node.props.style);
        return (
          style?.backgroundColor === theme.primary && style?.borderRadius === Shape.radius.full
        );
      });
      expect(button.props.accessibilityState.disabled).toBe(false);
      expect(surface).toBeTruthy();
      expect(labelStyle.color).toBe(theme.onPrimary);
      expect(contrast(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
