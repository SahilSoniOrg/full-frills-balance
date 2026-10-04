import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { Shape, Size, Spacing } from '@/src/constants';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SubmitFooterProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  requirementHint?: string | null;
}

export const SubmitFooter = ({
  onPress,
  label,
  disabled,
  requirementHint,
}: SubmitFooterProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isKeyboardVisible } = useKeyboard();
  const bottomPadding = isKeyboardVisible
    ? Spacing.md
    : Math.max(Spacing.lg, insets.bottom + Spacing.md);

  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {disabled && requirementHint ? (
        <AppText variant="caption" color="secondary" style={styles.requirementHint}>
          {requirementHint}
        </AppText>
      ) : null}
      <AppButton
        variant="primary"
        onPress={onPress}
        disabled={disabled}
        style={styles.button}
        buttonStyle={[
          styles.button,
          disabled ? { backgroundColor: theme.surfaceSecondary } : undefined,
        ]}
        testID="submit-footer-button"
        accessibilityLabel={label}
      >
        {disabled ? (
          <AppText variant="body" weight="semibold" style={{ color: theme.text }}>
            {label}
          </AppText>
        ) : (
          label
        )}
      </AppButton>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  requirementHint: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  button: {
    height: Size.buttonXl,
    borderRadius: Shape.radius.full,
  },
});
