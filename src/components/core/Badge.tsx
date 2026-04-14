import { AppIcon, IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useMemo } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

export type BadgeProps = ViewProps & {
  children: React.ReactNode;
  variant?: ComponentVariant;
  size?: 'sm' | 'md';
  solid?: boolean;
  icon?: IconName | string | null;
  fallbackIcon?: IconName;
  backgroundColor?: string;
  textColor?: string;
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  solid = false,
  icon,
  fallbackIcon,
  backgroundColor: customBg,
  textColor: customText,
  style,
  ...props
}: BadgeProps) {
  const { theme, fonts, getVariantColors } = useTheme();

  const { badgeStyle, textStyle, iconSize, finalTextColor } = useMemo(() => {
    const variantColors = getVariantColors(variant);
    const backgroundColor = customBg || (solid ? variantColors.main : variantColors.light);
    const textColor = customText || (solid ? variantColors.contrast : variantColors.main);

    const sizeStyles = size === 'sm' ? styles.sizeSm : styles.sizeMd;
    const textTypography = size === 'sm' ? styles.textSm : styles.textMd;
    const currentIconSize = size === 'sm' ? Typography.sizes.xs : Typography.sizes.sm;

    return {
      badgeStyle: [styles.badge, sizeStyles, { backgroundColor }, style],
      textStyle: [
        textTypography,
        {
          color: textColor,
          fontFamily: fonts.semibold,
        },
      ],
      iconSize: currentIconSize,
      finalTextColor: textColor,
    };
  }, [getVariantColors, fonts, variant, size, solid, customBg, customText, style]);

  return (
    <View style={badgeStyle} {...props}>
      <View style={styles.content}>
        {(icon || fallbackIcon) && (
          <AppIcon
            name={icon as any}
            fallbackIcon={fallbackIcon}
            size={iconSize}
            color={finalTextColor}
            style={styles.icon}
          />
        )}
        <AppText variant="caption" style={textStyle}>
          {children}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minWidth: 20,
    minHeight: 20,
  },
  sizeMd: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minWidth: 24,
    minHeight: 24,
  },
  textSm: {
    fontSize: Typography.sizes.xs,
  },
  textMd: {
    fontSize: Typography.sizes.sm,
  },
  icon: {
    marginRight: Spacing.xs,
  },
});
