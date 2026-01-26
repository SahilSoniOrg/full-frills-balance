/**
 * ListRow - Consistent list item component
 * Clean, minimal list design inspired by Ivy Wallet
 */

import { AppText, type AppTextProps } from '@/src/components/core/AppText'
import { Opacity, Spacing, ThemeMode } from '@/src/constants/design-tokens'
import { useThemeColors } from '@/src/constants/theme-helpers'
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type TouchableOpacityProps
} from 'react-native'

export type ListRowProps = TouchableOpacityProps & {
  // Content areas
  leading?: React.ReactNode
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  // Visual options
  showDivider?: boolean
  padding?: 'sm' | 'md' | 'lg'
  // Text customization
  titleVariant?: AppTextProps['variant']
  subtitleVariant?: AppTextProps['variant']
  // Theme mode override (for design preview)
  themeMode?: ThemeMode
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showDivider = false,
  padding = 'md',
  titleVariant = 'body',
  subtitleVariant = 'caption',
  themeMode,
  style,
  onPress,
  ...props
}: ListRowProps) {
  const theme = useThemeColors(themeMode)

  // Get padding styles
  const getPaddingStyles = () => {
    switch (padding) {
      case 'sm':
        return {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        }
      case 'md':
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        }
      case 'lg':
        return {
          paddingHorizontal: Spacing.xl,
          paddingVertical: Spacing.lg,
        }
      default:
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        }
    }
  }

  const content = (
    <View style={[styles.container, getPaddingStyles(), style]}>
      {leading && <View style={styles.leading}>{leading}</View>}

      <View style={styles.content}>
        <AppText
          variant={titleVariant}
          color="primary"
          numberOfLines={1}
          style={styles.title}
          themeMode={themeMode}
        >
          {title}
        </AppText>
        {subtitle && (
          <AppText
            variant={subtitleVariant}
            color="secondary"
            numberOfLines={2}
            style={styles.subtitle}
            themeMode={themeMode}
          >
            {subtitle}
          </AppText>
        )}
      </View>

      {trailing && <View style={styles.trailing}>{trailing}</View>}

      {showDivider && (
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.divider }
          ]}
        />
      )}
    </View>
  )

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={Opacity.heavy}
        {...props}
      >
        {content}
      </TouchableOpacity>
    )
  }

  return (
    <View {...props}>
      {content}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
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
  divider: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.xl + Spacing.lg, // account for icon + padding
    right: 0,
    height: 1,
  },
})
