import { AppText } from '@/src/components/core/AppText';
import { useTheme } from '@/src/hooks/use-theme';
import { personInitials } from '@/src/utils/personName';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Shared diameter for header trigger + drawer profile. */
export const PERSON_AVATAR_SIZE = 44;

export type PersonAvatarProps = {
  name: string;
  /** Outer diameter in px. Defaults to {@link PERSON_AVATAR_SIZE}. */
  size?: number;
  /** Letter count for initials (default 2 — same in header + drawer). */
  maxChars?: 1 | 2;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Circular initials chip for the signed-in person (header trigger, drawer profile). */
export function PersonAvatar({
  name,
  size = PERSON_AVATAR_SIZE,
  maxChars = 2,
  style,
  testID,
}: PersonAvatarProps) {
  const { theme } = useTheme();
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
          backgroundColor: theme.surfaceSecondary,
        },
        style,
      ]}
    >
      <AppText variant="body" weight="semibold" color="secondary" numberOfLines={1}>
        {personInitials(name, maxChars)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
