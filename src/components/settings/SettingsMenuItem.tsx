import { Icon, AppIcon, AppText, PressScaleTouchable, type IconName } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { SettingsIcon } from '@/src/components/settings/SettingsIcon';
import { SettingsFocusTarget } from '@/src/components/settings/SettingsFocusTarget';
import React from 'react';
import { ActivityIndicator, type ViewProps } from 'react-native';

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
          <ActivityIndicator size="small" color={theme.textSecondary} />
        </Box>
      );
    }

    return (
      <Inline align="center" space="xs">
        {rightContent}
        {hasArrow && onPress && (
          <AppIcon
            name={Icon.ChevronRight}
            size={Size.xs}
            color={theme.textSecondary}
            style={{ opacity: Opacity.medium }}
          />
        )}
      </Inline>
    );
  };

  const rowBody = (
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
              style={{ marginTop: prominent ? Spacing.xs : Spacing.xs / 2 }}
            >
              {description}
            </AppText>
          )}
        </Stack>
      </Inline>
      {renderRightContent()}
    </Inline>
  );

  const row = (
    <Inline align="center" style={style}>
      {onPress ? (
        <PressScaleTouchable
          onPress={() => onPress()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={title}
          accessibilityHint={description}
          testID={testID}
          hitSlop={{ top: Spacing.xs, bottom: Spacing.xs, left: 0, right: 0 }}
          style={{ flex: 1, minHeight: Size.touchTarget }}
        >
          {rowBody}
        </PressScaleTouchable>
      ) : (
        <Box
          flex={1}
          style={{ minHeight: Size.touchTarget }}
          testID={testID}
          accessibilityLabel={title}
          accessibilityHint={description}
          accessibilityState={{ disabled }}
        >
          {rowBody}
        </Box>
      )}
      {rightAction}
    </Inline>
  );

  return focusId ? <SettingsFocusTarget targetId={focusId}>{row}</SettingsFocusTarget> : row;
}
