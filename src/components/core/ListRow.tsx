import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { Opacity, Spacing, SpacingKey } from '@/src/constants/design-tokens';
import { Box, type BoxViewProps } from '@/src/design-system/Box';
import { Separator } from '@/src/design-system/Separator';
import { extractBoxProps } from '@/src/design-system/utils';
import React from 'react';
import { StyleSheet, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

export type ListRowProps = TouchableOpacityProps &
  BoxViewProps & {
    // Content areas
    leading?: React.ReactNode;
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
    // Visual options
    showSeparator?: boolean;
    padding?: 'sm' | 'md' | 'lg';
    leadingWidth?: number;
    // Text customization
    titleVariant?: AppTextProps['variant'];
    subtitleVariant?: AppTextProps['variant'];
    titleColor?: string;
  };

export function ListRow(initialProps: ListRowProps) {
  const {
    leading,
    title,
    subtitle,
    trailing,
    showSeparator = false,
    padding = 'md',
    leadingWidth,
    titleVariant = 'body',
    subtitleVariant = 'caption',
    titleColor = 'primary',
    onPress,
    ...passthroughProps
  } = initialProps;

  const { boxProps, restProps } = extractBoxProps(passthroughProps);

  const { style, as: _as, ...rowBoxProps } = boxProps;

  // Resolve semantic padding tokens
  const PADDING_HORIZONTAL_MAP: Record<NonNullable<ListRowProps['padding']>, SpacingKey> = {
    sm: 'md',
    md: 'lg',
    lg: 'xl',
  };

  const PADDING_VERTICAL_MAP: Record<NonNullable<ListRowProps['padding']>, SpacingKey> = {
    sm: 'xs',
    md: 'sm',
    lg: 'md',
  };

  const paddingHorizontalToken = PADDING_HORIZONTAL_MAP[padding || 'md'];
  const paddingVerticalToken = PADDING_VERTICAL_MAP[padding || 'md'];

  const paddingH = Spacing[paddingHorizontalToken as SpacingKey];

  const leadingSlotWidth = leadingWidth ?? Spacing.xl;
  const separatorInset = paddingH + (leading ? leadingSlotWidth + Spacing.md : 0);
  const defaultLabel = `${title}${subtitle ? `, ${subtitle}` : ''}`;
  const { accessibilityLabel, accessibilityRole, activeOpacity, ...nativeProps } =
    restProps as TouchableOpacityProps;
  const touchableProps = onPress
    ? {
        onPress,
        activeOpacity: activeOpacity ?? Opacity.heavy,
        accessibilityRole: accessibilityRole ?? 'button',
        accessibilityLabel: accessibilityLabel || defaultLabel,
      }
    : {
        accessibilityRole,
        accessibilityLabel,
      };

  const rowContent = (
    <>
      {leading && (
        <Box minWidth={leadingSlotWidth} marginRight="md" alignItems="center">
          {leading}
        </Box>
      )}

      <Box flex={1} justifyContent="center">
        <AppText
          variant={titleVariant}
          color={titleColor as AppTextProps['color']}
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </AppText>
        {subtitle && (
          <AppText
            variant={subtitleVariant}
            color="secondary"
            numberOfLines={2}
            style={styles.subtitle}
          >
            {subtitle}
          </AppText>
        )}
      </Box>

      {trailing && (
        <Box marginLeft="md" alignItems="flex-end">
          {trailing}
        </Box>
      )}

      {showSeparator && <Separator marginLeft={separatorInset} />}
    </>
  );

  if (onPress) {
    return (
      <Box
        as={TouchableOpacity}
        flexDirection="row"
        alignItems="center"
        paddingHorizontal={paddingHorizontalToken}
        paddingVertical={paddingVerticalToken}
        style={style}
        {...rowBoxProps}
        {...nativeProps}
        {...touchableProps}
      >
        {rowContent}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      paddingHorizontal={paddingHorizontalToken}
      paddingVertical={paddingVerticalToken}
      style={style}
      {...rowBoxProps}
      {...nativeProps}
      {...touchableProps}
    >
      {rowContent}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: Spacing.xs / 2,
    flexShrink: 1,
  },
  trailing: {
    marginLeft: Spacing.md,
    alignItems: 'flex-end',
  },
});
