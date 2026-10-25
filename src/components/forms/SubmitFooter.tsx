import { AppButton } from '@/src/components/core/AppButton';
import { AppText } from '@/src/components/core/AppText';
import { ChromeMotion, Scale, Shape, Size, Spacing } from '@/src/constants';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useSafeAreaLayout } from '@/src/design-system/SafeArea';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface SubmitFooterProps {
  onPress: () => void;
  label: string;
  disabled: boolean;
  requirementHint?: string | null;
  /** Called when the user taps the disabled button (after marking attempted). */
  onDisabledPress?: () => void;
  loading?: boolean;
  hintTone?: 'secondary' | 'error';
  /** Content above the submit button (e.g. planned-mode control). */
  above?: ReactNode;
  /** Trailing control beside the submit button (e.g. keyboard Done). */
  trailing?: ReactNode;
  /** Brief scale pulse after a successful save. */
  pulse?: boolean;
  bottomInset?: 'form' | 'journal';
}

export const SubmitFooter = ({
  onPress,
  label,
  disabled,
  requirementHint,
  onDisabledPress,
  loading = false,
  hintTone = 'secondary',
  above,
  trailing,
  pulse = false,
  bottomInset = 'form',
}: SubmitFooterProps) => {
  const { theme } = useTheme();
  // Hint only after a tap on the disabled button, not on open.
  const [attempted, setAttempted] = useState(false);
  const { bottomSpacing } = useSafeAreaLayout();
  const { isKeyboardVisible } = useKeyboard();
  const reduceMotion = useReducedMotion();
  const showPulse = pulse && !reduceMotion;
  const compact = bottomInset === 'journal';
  const bottomPadding = isKeyboardVisible
    ? compact
      ? Spacing.xs
      : Spacing.md
    : compact
      ? bottomSpacing.journalFooter
      : bottomSpacing.formFooter;

  const buttonSize = compact ? styles.buttonCompact : styles.button;
  const button = (
    <AppButton
      variant="primary"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      style={buttonSize}
      buttonStyle={[
        buttonSize,
        disabled && !compact ? { backgroundColor: theme.surfaceSecondary } : undefined,
      ]}
      testID="submit-footer-button"
      accessibilityLabel={label}
    >
      {disabled && !compact ? (
        <AppText variant="body" weight="semibold" style={{ color: theme.text }}>
          {label}
        </AppText>
      ) : (
        label
      )}
    </AppButton>
  );

  return (
    <View
      style={[
        styles.footer,
        compact && styles.footerCompact,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {disabled && attempted && requirementHint ? (
        <AppText
          variant="caption"
          color={hintTone === 'error' ? 'error' : 'secondary'}
          style={styles.requirementHint}
          accessibilityLiveRegion="polite"
        >
          {requirementHint}
        </AppText>
      ) : null}

      {above}

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.submitButtonWrapper}
          disabled={!disabled}
          onPress={() => {
            setAttempted(true);
            onDisabledPress?.();
          }}
          accessible={false}
        >
          {pulse ? (
            <MotiView
              animate={{ scale: showPulse ? 1.03 : Scale.identity }}
              transition={ChromeMotion.spring}
            >
              {button}
            </MotiView>
          ) : (
            button
          )}
        </Pressable>
        {trailing}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  footerCompact: {
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  requirementHint: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  submitButtonWrapper: {
    flex: 1,
  },
  button: {
    height: Size.buttonXl,
    borderRadius: Shape.radius.full,
  },
  buttonCompact: {
    height: Size.buttonLg,
    borderRadius: Shape.radius.r4,
  },
});
