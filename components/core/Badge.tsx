import { Shape, Spacing, ThemeMode, Typography } from '@/constants/design-tokens'
import { useThemeColors } from '@/constants/theme-helpers'
import { useTheme } from '@/hooks/use-theme'
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers'
import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { AppText } from './AppText'

export type BadgeProps = ViewProps & {
  // Badge content
  children: React.ReactNode
  // Badge variants - limited options
  variant?: ComponentVariant
  // Badge size
  size?: 'sm' | 'md'
  // Use solid background instead of light tinted background
  solid?: boolean
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
  // Optional Icon
  icon?: keyof typeof Ionicons.glyphMap
  // Color overrides
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
  const { theme: globalTheme } = useTheme()
  const overrideTheme = useThemeColors(themeMode)
  const theme = themeMode ? overrideTheme : globalTheme

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
          <Ionicons
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
