import { AppIcon, AppText, type IconName, isValidIconName } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import React from 'react';
import { TouchableOpacity, type ViewProps } from 'react-native';

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
  prominent?: boolean;
  style?: ViewProps['style'];
  testID?: string;
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
  prominent = false,
  style,
  testID,
}: SettingsMenuItemProps) {
  const { theme } = useTheme();

  const renderLeftIcon = () => {
    if (!leftIcon) return null;
    if (typeof leftIcon === 'string') {
      const isActualIcon = isValidIconName(leftIcon);
      return (
        <Box
          background={danger ? 'errorLight' : prominent ? 'transparent' : 'surfaceSecondary'}
          backgroundOpacity={prominent && !danger ? 'selection' : undefined}
          borderRadius={prominent ? 'full' : 'r2'}
          borderWidth={0}
          padding="xs"
          alignItems="center"
          justifyContent="center"
          style={{ width: prominent ? 34 : 32, height: prominent ? 34 : 32 }}
        >
          {isActualIcon ? (
            <AppIcon
              name={leftIcon}
              size={prominent ? 21 : 20}
              color={danger ? theme.error : iconColor || prominent ? theme.primary : theme.text}
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
      <Box width={prominent ? 34 : 32} alignItems="center" justifyContent="center">
        {leftIcon}
      </Box>
    );
  };

  const renderRightContent = () => {
    if (loading) {
      return (
        <Box padding="xs">
          <MotiView
            from={{ rotate: '0deg' }}
            animate={{ rotate: '360deg' }}
            transition={{
              type: 'timing',
              duration: 1000,
              loop: true,
              repeatReverse: false,
            }}
          >
            <AppIcon
              name="refresh"
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
            name="chevronRight"
            size={16}
            color={theme.textSecondary}
            style={{ opacity: Opacity.medium }}
          />
        )}
      </Inline>
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={Opacity.heavy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || !onPress }}
      accessibilityLabel={title}
      accessibilityHint={description}
      testID={testID}
      style={style}
    >
      <Inline
        align="center"
        justify="space-between"
        paddingHorizontal={prominent ? 'sm' : 'md'}
        paddingVertical={prominent ? 'sm' : 'sm'}
        space="md"
      >
        <Inline align="center" space="md" flex={1}>
          {renderLeftIcon()}
          <Stack space={0} flex={1}>
            <AppText
              variant="body"
              weight={prominent ? 'semibold' : 'medium'}
              color={danger ? 'error' : 'text'}
            >
              {title}
            </AppText>
            {description && (
              <AppText variant="caption" color="secondary" style={{ marginTop: prominent ? 3 : 2 }}>
                {description}
              </AppText>
            )}
          </Stack>
        </Inline>

        {renderRightContent()}
      </Inline>
    </TouchableOpacity>
  );
}
