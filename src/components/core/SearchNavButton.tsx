import { AppIcon } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

export interface SearchNavButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

/**
 * SearchNavButton — search icon that navigates or triggers an action.
 * Does not expand inline; pair with a dedicated search screen.
 */
export const SearchNavButton = ({
  onPress,
  accessibilityLabel = AppConfig.strings.common.searchPlaceholder,
}: SearchNavButtonProps) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.iconButton, { backgroundColor: theme.surface }, Shape.elevation.sm]}
      activeOpacity={Opacity.heavy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <AppIcon name="search" size={Size.sm} color={theme.text} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
