import { AppText } from '@/src/components/core/AppText';
import { AppIcon } from '@/src/components/core/AppIcon';
import { Opacity } from '@/src/constants/design-tokens';
import { getReadableColor, withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { personInitials } from '@/src/components/core/personName';
import type { IconName } from '@/src/types/domainIcons';
import { isValidIconName } from '@/src/types/domainIcons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Shared diameter for header trigger + drawer profile. */
export const PERSON_AVATAR_SIZE = 44;

export type PersonAvatarProps = {
  name: string;
  /** Optional accent color stored on the person profile. */
  color?: string;
  /** Optional selected glyph; initials remain the fallback for older profiles. */
  icon?: IconName;
  /** Outer diameter in px. Defaults to {@link PERSON_AVATAR_SIZE}. */
  size?: number;
  /** Letter count for initials (default 2 — same in header + drawer). */
  maxChars?: 1 | 2;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Circular initials chip for a person profile or account identity. */
export function PersonAvatar({
  name,
  color,
  icon,
  size = PERSON_AVATAR_SIZE,
  maxChars = 2,
  style,
  testID,
}: PersonAvatarProps) {
  const { theme } = useTheme();
  const trimmedColor = color?.trim();
  const hasCustomColor = Boolean(trimmedColor);
  const textVariant = size >= 56 ? 'subheading' : size <= 28 ? 'caption' : 'body';
  const textColor = trimmedColor ? getReadableColor(trimmedColor, theme.surface) : undefined;

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: trimmedColor
            ? withOpacity(trimmedColor, Opacity.soft)
            : theme.surfaceSecondary,
          ...(hasCustomColor
            ? { borderWidth: 1, borderColor: withOpacity(trimmedColor!, Opacity.medium) }
            : {}),
        },
        style,
      ]}
    >
      {icon && isValidIconName(icon) ? (
        <AppIcon
          name={icon}
          size={Math.round(size * 0.44)}
          color={textColor ?? theme.textSecondary}
        />
      ) : (
        <AppText
          variant={textVariant}
          weight="semibold"
          color={hasCustomColor ? undefined : 'secondary'}
          style={textColor ? { color: textColor } : undefined}
          numberOfLines={1}
        >
          {personInitials(name, maxChars)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
