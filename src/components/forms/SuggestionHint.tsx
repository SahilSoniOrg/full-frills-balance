import { AppIcon, AppText, Icon } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { getReadableColor } from '@/src/utils/color-math';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Pressable, View } from 'react-native';

export interface SuggestionHintProps {
  message: string;
  actionLabel: string;
  onAccept: () => void;
  onDismiss?: () => void;
  testID?: string;
}

export function SuggestionHint({
  message,
  actionLabel,
  onAccept,
  onDismiss,
  testID,
}: SuggestionHintProps) {
  const { theme } = useTheme();
  // Tokens are readable in Deep Space; the guard keeps other themes' accents legible.
  const accent = getReadableColor(theme.primary, theme.surfaceSecondary);
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
      }}
    >
      <AppText variant="bodySmall" style={{ color: theme.textSecondary, flex: 1 }}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onAccept}
        testID={testID ? `${testID}-action` : undefined}
        hitSlop={8}
      >
        <AppText variant="bodySmall" weight="semibold" style={{ color: accent }}>
          {actionLabel}
        </AppText>
      </Pressable>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.dismissSuggestion}
          onPress={onDismiss}
          hitSlop={8}
        >
          <AppIcon name={Icon.Close} size={18} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
