import { IconButton } from '@/src/components/core';
import type { IconButtonVariant } from '@/src/components/core/IconButton';
import { Size } from '@/src/constants';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { useTheme } from '@/src/hooks/use-theme';

type PrivacyToggleButtonProps = {
  variant?: IconButtonVariant;
  size?: number;
  iconColor?: string;
  testID?: string;
};

/**
 * Screen-local privacy eye. Must render under PrivacyScopeProvider.
 * Toggles only this screen's override — does not write global prefs.
 */
export function PrivacyToggleButton({
  variant = 'surface',
  size = Size.iconSm,
  iconColor,
  testID = 'privacy-toggle',
}: PrivacyToggleButtonProps) {
  const { theme } = useTheme();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyScope();

  return (
    <IconButton
      name={isPrivacyMode ? 'eyeOff' : 'eye'}
      size={size}
      variant={variant}
      onPress={togglePrivacyMode}
      accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
      iconColor={iconColor ?? theme.text}
      testID={testID}
    />
  );
}
