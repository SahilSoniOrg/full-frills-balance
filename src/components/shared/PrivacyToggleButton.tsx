import { Icon, IconButton } from '@/src/components/core';
import type { IconButtonVariant } from '@/src/components/core/IconButton';
import { AppConfig, Size } from '@/src/constants';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { useTheme } from '@/src/hooks/use-theme';
import { toast } from '@/src/utils/alerts';
import { getReadableColor } from '@/src/utils/color-math';

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
  const { isPrivacyMode, isPrivacyOverridden, togglePrivacyMode } = usePrivacyScope();
  const description = AppConfig.strings.navigation.privacyDescription(
    isPrivacyMode,
    isPrivacyOverridden,
  );

  return (
    <IconButton
      name={isPrivacyMode ? Icon.EyeOff : Icon.Eye}
      size={size}
      variant={variant}
      onPress={togglePrivacyMode}
      onLongPress={() => toast.info(description, { key: 'privacy-help' })}
      accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
      accessibilityHint={description}
      iconColor={
        isPrivacyOverridden
          ? getReadableColor(
              theme.success,
              variant === 'clear' ? theme.background : theme.surface,
              3,
            )
          : (iconColor ?? theme.text)
      }
      testID={testID}
    />
  );
}
