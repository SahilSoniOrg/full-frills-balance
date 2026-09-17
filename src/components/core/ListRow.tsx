import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Spacing, SpacingKey } from '@/src/constants/design-tokens';
import { Box, type BoxViewProps } from '@/src/design-system/Box';
import { Separator } from '@/src/design-system/Separator';
import { extractBoxProps } from '@/src/design-system/utils';
import React from 'react';
import {
  StyleSheet,
  type AccessibilityState,
  type LayoutChangeEvent,
  type TouchableOpacityProps,
} from 'react-native';

type ListRowPressProps = {
  onPress?: TouchableOpacityProps['onPress'];
  onLongPress?: TouchableOpacityProps['onLongPress'];
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: TouchableOpacityProps['accessibilityRole'];
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  hitSlop?: TouchableOpacityProps['hitSlop'];
  delayLongPress?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  pointerEvents?: BoxViewProps['pointerEvents'];
  nativeID?: string;
  accessible?: boolean;
};

export type ListRowProps = BoxViewProps &
  ListRowPressProps & {
    leading?: React.ReactNode;
    title: string | React.ReactNode;
    subtitle?: string | React.ReactNode;
    trailing?: React.ReactNode;
    showSeparator?: boolean;
    padding?: 'sm' | 'md' | 'lg';
    leadingWidth?: number;
    titleVariant?: AppTextProps['variant'];
    subtitleVariant?: AppTextProps['variant'];
    titleColor?: string;
  };

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
    onLongPress,
    disabled,
    testID,
    accessibilityLabel,
    accessibilityRole,
    accessibilityHint,
    accessibilityState,
    hitSlop,
    delayLongPress,
    onLayout,
    pointerEvents,
    nativeID,
    accessible,
    ...passthroughProps
  } = initialProps;

  const { boxProps } = extractBoxProps(passthroughProps);
  const { style, as: _as, ...rowBoxProps } = boxProps;

  const paddingHorizontalToken = PADDING_HORIZONTAL_MAP[padding];
  const paddingVerticalToken = PADDING_VERTICAL_MAP[padding];
  const paddingH = Spacing[paddingHorizontalToken];
  const leadingSlotWidth = leadingWidth ?? Spacing.xl;
  const separatorInset = paddingH + (leading ? leadingSlotWidth + Spacing.md : 0);
  const defaultLabel = `${title}${subtitle ? `, ${subtitle}` : ''}`;
  const isPressable = onPress != null || onLongPress != null;

  const hostProps = {
    testID,
    onLayout,
    pointerEvents,
    nativeID,
    accessible,
    accessibilityHint,
    accessibilityState,
  };

  const rowContent = (
    <>
      {leading && (
        <Box minWidth={leadingSlotWidth} marginRight="md" alignItems="center">
          {leading}
        </Box>
      )}
      <Box flex={1} justifyContent="center">
        {typeof title === 'string' ? (
          <AppText
            variant={titleVariant}
            color={titleColor as AppTextProps['color']}
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </AppText>
        ) : (
          title
        )}
        {subtitle &&
          (typeof subtitle === 'string' ? (
            <AppText
              variant={subtitleVariant}
              color="secondary"
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </AppText>
          ) : (
            subtitle
          ))}
      </Box>
      {trailing && (
        <Box marginLeft="md" alignItems="flex-end">
          {trailing}
        </Box>
      )}
      {showSeparator && <Separator marginLeft={separatorInset} />}
    </>
  );

  const row = (
    <Box
      flexDirection="row"
      alignItems="center"
      paddingHorizontal={paddingHorizontalToken}
      paddingVertical={paddingVerticalToken}
      style={isPressable ? undefined : style}
      {...rowBoxProps}
      {...(!isPressable
        ? {
            ...hostProps,
            accessibilityRole,
            accessibilityLabel,
          }
        : null)}
    >
      {rowContent}
    </Box>
  );

  if (isPressable) {
    return (
      <PressScaleTouchable
        style={style}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        delayLongPress={delayLongPress}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel || defaultLabel}
        {...hostProps}
      >
        {row}
      </PressScaleTouchable>
    );
  }

  return row;
}

const styles = StyleSheet.create({
  title: { flexShrink: 1 },
  subtitle: { marginTop: Spacing.xs / 2, flexShrink: 1 },
});
