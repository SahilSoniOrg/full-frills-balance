import { AppIcon, AppText, type IconName, isValidIconName } from '@/src/components/core';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import {
  SETTINGS_PROMINENT_ICON_SLOT,
  SETTINGS_ROW_ICON_SLOT,
} from '@/src/components/settings/settingsTokens';

type SettingsIconProps = {
  icon: IconName | React.ReactNode;
  prominent?: boolean;
  disabled?: boolean;
  danger?: boolean;
  iconColor?: boolean;
  background?: boolean;
};

/** Canonical leading-icon slot for settings rows. */
export function SettingsIcon({
  icon,
  prominent = false,
  disabled = false,
  danger = false,
  iconColor = true,
  background = true,
}: SettingsIconProps) {
  const { theme } = useTheme();
  const size = prominent ? SETTINGS_PROMINENT_ICON_SLOT : SETTINGS_ROW_ICON_SLOT;
  const isNamedIcon = typeof icon === 'string' && isValidIconName(icon);

  return (
    <Box
      background={
        background
          ? danger
            ? 'errorLight'
            : prominent
              ? 'transparent'
              : 'surfaceSecondary'
          : undefined
      }
      backgroundOpacity={background && prominent && !danger ? 'selection' : undefined}
      borderRadius={background ? (prominent ? 'full' : 'r2') : undefined}
      borderWidth={0}
      padding={background ? 'xs' : undefined}
      alignItems="center"
      justifyContent="center"
      style={{ width: size, height: size }}
    >
      {isNamedIcon ? (
        <AppIcon
          name={icon as IconName}
          size={prominent ? 21 : 20}
          color={
            disabled
              ? theme.textSecondary
              : danger
                ? theme.error
                : iconColor || prominent
                  ? theme.primary
                  : theme.text
          }
        />
      ) : typeof icon === 'string' ? (
        <AppText variant="body" style={{ fontSize: 16 }}>
          {icon}
        </AppText>
      ) : (
        icon
      )}
    </Box>
  );
}
