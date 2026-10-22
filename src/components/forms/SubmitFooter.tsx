import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { Shape, Size, Spacing } from '@/src/constants';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaLayout } from '@/src/design-system/SafeArea';

interface SubmitFooterProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  requirementHint?: string | null;
}

export const SubmitFooter = ({ onPress, label, disabled, requirementHint }: SubmitFooterProps) => {
  const { theme } = useTheme();
  // Hint only after a tap on the disabled button, not on open.
  const [attempted, setAttempted] = useState(false);
  const { bottomSpacing } = useSafeAreaLayout();
  const { isKeyboardVisible } = useKeyboard();
  const bottomPadding = isKeyboardVisible ? Spacing.md : bottomSpacing.formFooter;

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
      {disabled && attempted && requirementHint ? (
        <AppText variant="caption" color="secondary" style={styles.requirementHint}>
          {requirementHint}
        </AppText>
      ) : null}
      <Pressable disabled={!disabled} onPress={() => setAttempted(true)} accessible={false}>
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
      </Pressable>
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
