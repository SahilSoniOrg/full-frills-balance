import { AppIcon, AppText, Icon } from '@/src/components/core';
import { IvyPalette, Spacing } from '@/src/constants/design-tokens';
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
  const { theme, themeMode } = useTheme();
  const accent = themeMode === 'light' ? IvyPalette.greenDark : theme.primary;
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
