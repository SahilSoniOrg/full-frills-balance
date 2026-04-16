import { AppIcon, AppText, type IconName, isValidIconName } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { TouchableOpacity } from 'react-native';

type SettingsMenuItemProps = {
  title: string;
  description?: string;
  leftIcon?: IconName | React.ReactNode;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  hasArrow?: boolean;
  disabled?: boolean;
  danger?: boolean;
  loading?: boolean;
  iconColor?: boolean;
};

/**
 * SettingsMenuItem - A flexible row for settings inspired by rainbowLink
 */
export function SettingsMenuItem({
  title,
  description,
  leftIcon,
  rightContent,
  onPress,
  hasArrow = true,
  disabled = false,
  danger = false,
  loading = false,
  iconColor = undefined,
}: SettingsMenuItemProps) {
  const { theme } = useTheme();

  const renderLeftIcon = () => {
    if (!leftIcon) return null;
    if (typeof leftIcon === 'string') {
      const isActualIcon = isValidIconName(leftIcon);
      return (
        <Box
          background={danger ? 'errorLight' : 'surfaceSecondary'}
          borderRadius="r2"
          padding="xs"
          alignItems="center"
          justifyContent="center"
          style={{ width: 32, height: 32 }}
        >
          {isActualIcon ? (
            <AppIcon
              name={leftIcon}
              size={20}
              color={iconColor ? theme.primary : danger ? theme.error : theme.text}
            />
          ) : (
            <AppText variant="body" style={{ fontSize: 16 }}>
              {leftIcon}
            </AppText>
          )}
        </Box>
      );
    }
    return (
      <Box width={32} alignItems="center" justifyContent="center">
        {leftIcon}
      </Box>
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={Opacity.heavy}
    >
      <Inline
        align="center"
        justify="space-between"
        paddingHorizontal="md"
        paddingVertical="sm"
        space="md"
      >
        <Inline align="center" space="md" flex={1}>
          {renderLeftIcon()}
          <Stack space={0} flex={1}>
            <AppText variant="body" weight="medium" color={danger ? 'error' : 'text'}>
              {title}
            </AppText>
            {description && (
              <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                {description}
              </AppText>
            )}
          </Stack>
        </Inline>

        <Inline align="center" space="xs">
          {loading ? (
            <Box padding="xs">
              <AppIcon
                name="refresh"
                size={16}
                color={theme.textSecondary}
                style={{ opacity: Opacity.medium }}
              />
            </Box>
          ) : (
            rightContent
          )}
          {hasArrow && onPress && (
            <AppIcon
              name="chevronRight"
              size={16}
              color={theme.textSecondary}
              style={{ opacity: Opacity.medium }}
            />
          )}
        </Inline>
      </Inline>
    </TouchableOpacity>
  );
}
