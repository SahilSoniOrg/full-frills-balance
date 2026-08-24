import { IconMap, isValidIconName, type IconName } from '@/src/types/domainIcons';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { ViewStyle } from 'react-native';

// Preserve the existing direct-module exports while definitions live neutrally.
export { IconMap, isValidIconName } from '@/src/types/domainIcons';
export type { IconName } from '@/src/types/domainIcons';

interface AppIconProps {
  name: IconName | undefined;
  fallbackIcon?: IconName;
  color?: string;
  size?: number;
  style?: ViewStyle;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * AppIcon - Centralized icon component using Lucide
 * Enforces consistency and maps semantic names to specific icons.
 */
export const AppIcon = ({
  name,
  fallbackIcon,
  color,
  size = 24,
  style,
  strokeWidth = 2,
  opacity,
}: AppIconProps) => {
  const { theme } = useTheme();

  const iconToUse = isValidIconName(name)
    ? name
    : isValidIconName(fallbackIcon)
      ? fallbackIcon
      : null;

  if (!iconToUse) return null;

  const IconComponent = IconMap[iconToUse as keyof typeof IconMap];

  return (
    <IconComponent
      color={resolveThemeColor(theme, color) || theme.icon}
      size={size}
      style={[style, opacity !== undefined && { opacity }]}
      strokeWidth={strokeWidth}
    />
  );
};
