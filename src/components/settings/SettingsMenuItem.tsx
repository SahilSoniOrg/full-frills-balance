import { Icon, AppIcon, AppText, type IconName } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { SettingsIcon } from '@/src/components/settings/SettingsIcon';
import { SettingsFocusTarget } from '@/src/components/settings/SettingsFocusTarget';
import { MotiView } from 'moti';
import React from 'react';
import { TouchableOpacity, type ViewProps } from 'react-native';

export type SettingsMenuItemProps = {
  title: string;
  titleMeta?: string;
  description?: string;
  leftIcon?: IconName | React.ReactNode;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  hasArrow?: boolean;
  disabled?: boolean;
  danger?: boolean;
  loading?: boolean;
  iconColor?: boolean;
  prominent?: boolean;
  style?: ViewProps['style'];
  testID?: string;
  /** Stable id used by settings search and focus navigation. */
  focusId?: string;
  rightAction?: React.ReactNode;
  iconBackground?: boolean;
};

export function SettingsMenuItem({
  title,
  titleMeta,
  description,
  leftIcon,
  rightContent,
  onPress,
  hasArrow = true,
  disabled = false,
  danger = false,
  loading = false,
  iconColor = true,
  prominent = false,
  style,
  testID,
  focusId,
  rightAction,
  iconBackground = true,
}: SettingsMenuItemProps) {
  const { theme } = useTheme();

  const renderRightContent = () => {
    if (loading) {
      return (
        <Box padding="xs">
          <MotiView
            from={{ rotate: '0deg' }}
            animate={{ rotate: '360deg' }}
            transition={{ type: 'timing', duration: 1000, loop: true, repeatReverse: false }}
          >
            <AppIcon
              name={Icon.Refresh}
              size={16}
              color={theme.textSecondary}
              style={{ opacity: Opacity.medium }}
            />
          </MotiView>
        </Box>
      );
    }

    return (
      <Inline align="center" space="xs">
        {rightContent}
        {hasArrow && onPress && (
          <AppIcon
            name={Icon.ChevronRight}
            size={16}
            color={theme.textSecondary}
            style={{ opacity: Opacity.medium }}
          />
        )}
      </Inline>
    );
  };

  const row = (
    <Inline align="center" style={style}>
      <TouchableOpacity
        onPress={onPress ? () => onPress() : undefined}
        disabled={disabled}
        activeOpacity={Opacity.heavy}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityState={{ disabled }}
        accessibilityLabel={title}
        accessibilityHint={description}
        testID={testID}
        style={{ flex: 1 }}
      >
        <Inline
          align="center"
          justify="space-between"
          paddingHorizontal={prominent ? 'sm' : 'md'}
          paddingVertical="sm"
          space="md"
        >
          <Inline align="center" space="md" flex={1}>
            {leftIcon && (
              <SettingsIcon
                icon={leftIcon}
                prominent={prominent}
                disabled={disabled}
                danger={danger}
                iconColor={iconColor}
                background={iconBackground}
              />
            )}
            <Stack space={0} flex={1}>
              <Inline align="center" space="sm">
                <AppText
                  variant="body"
                  weight={prominent ? 'bold' : 'semibold'}
                  color={danger ? 'error' : 'text'}
                >
                  {title}
                </AppText>
                {titleMeta && (
                  <AppText variant="caption" color="secondary">
                    {titleMeta}
                  </AppText>
                )}
              </Inline>
              {description && (
                <AppText
                  variant="caption"
                  color="secondary"
                  weight="medium"
                  style={{ marginTop: prominent ? 3 : 2 }}
                >
                  {description}
                </AppText>
              )}
            </Stack>
          </Inline>
          {renderRightContent()}
        </Inline>
      </TouchableOpacity>
      {rightAction}
    </Inline>
  );

  return focusId ? <SettingsFocusTarget targetId={focusId}>{row}</SettingsFocusTarget> : row;
}
