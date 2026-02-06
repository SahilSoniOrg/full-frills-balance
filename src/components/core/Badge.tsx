import { AppIcon, IconName } from '@/src/components/core/AppIcon'
import { AppText } from '@/src/components/core/AppText'
import { Shape, Spacing, ThemeMode, Typography } from '@/src/constants/design-tokens'
import { useThemedComponent } from '@/src/hooks/useThemedComponent'
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers'
import { useMemo } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'

export type BadgeProps = ViewProps & {
  children: React.ReactNode
  variant?: ComponentVariant
  size?: 'sm' | 'md'
  solid?: boolean
  themeMode?: ThemeMode
  icon?: IconName
  backgroundColor?: string
  textColor?: string
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  solid = false,
  icon,
  backgroundColor: customBg,
  textColor: customText,
  themeMode,
  style,
  ...props
}: BadgeProps) {
  const { theme } = useThemedComponent(themeMode)

  const { badgeStyle, textStyle, iconSize, finalTextColor } = useMemo(() => {
    const variantColors = getVariantColors(theme, variant)
    const backgroundColor = customBg || (solid ? variantColors.main : variantColors.light)
    const textColor = customText || (solid ? variantColors.contrast : variantColors.main)

    const sizeStyles = size === 'sm' ? styles.sizeSm : styles.sizeMd
    const textTypography = size === 'sm' ? styles.textSm : styles.textMd
    const currentIconSize = size === 'sm' ? Typography.sizes.xs : Typography.sizes.sm

    return {
      badgeStyle: [
        styles.badge,
        sizeStyles,
        { backgroundColor },
        style,
      ],
      textStyle: [
        textTypography,
        { color: textColor }
      ],
      iconSize: currentIconSize,
      finalTextColor: textColor
    }
  }, [theme, variant, size, solid, customBg, customText, style])

  return (
    <View style={badgeStyle} {...props}>
      <View style={styles.content}>
        {icon && (
          <AppIcon
            name={icon}
            size={iconSize}
            color={finalTextColor}
            style={styles.icon}
          />
        )}
        <AppText
          variant="caption"
          style={textStyle}
        >
          {children}
        </AppText>
      </View>
    </View>
  )
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
    fontFamily: Typography.fonts.semibold,
  },
  textMd: {
    fontSize: Typography.sizes.sm,
    fontFamily: Typography.fonts.semibold,
  },
  icon: {
    marginRight: Spacing.xs,
  },
})
