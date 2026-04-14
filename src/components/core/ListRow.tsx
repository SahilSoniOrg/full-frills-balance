/**
 * ListRow - Consistent list item component
 * Clean, minimal list design inspired by Ivy Wallet
 */

import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { Opacity, Spacing } from '@/src/constants/design-tokens';
import { Separator } from '@/src/design-system';
import { StyleSheet, TouchableOpacity, View, type TouchableOpacityProps } from 'react-native';

export type ListRowProps = TouchableOpacityProps & {
  // Content areas
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  // Visual options
  showSeparator?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  // Text customization
  titleVariant?: AppTextProps['variant'];
  subtitleVariant?: AppTextProps['variant'];
  titleColor?: string;
};

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  showSeparator = false,
  padding = 'md',
  titleVariant = 'body',
  subtitleVariant = 'caption',
  titleColor = 'primary',
  style,
  onPress,
  ...props
}: ListRowProps) {
  // Get padding styles
  const getPaddingStyles = () => {
    switch (padding) {
      case 'sm':
        return {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        };
      case 'md':
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        };
      case 'lg':
        return {
          paddingHorizontal: Spacing.xl,
          paddingVertical: Spacing.lg,
        };
      default:
        return {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        };
    }
  };

  const content = (
    <View style={[styles.container, getPaddingStyles(), style]}>
      {leading && <View style={styles.leading}>{leading}</View>}

      <View style={styles.content}>
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
      </View>

      {trailing && <View style={styles.trailing}>{trailing}</View>}

      {showSeparator && (
        <Separator
          marginLeft={padding === 'lg' ? Spacing.xl + Spacing.lg : Spacing.lg + Spacing.md}
        />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy} {...props}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View {...props}>{content}</View>;
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
