import { PrivacyToggleButton } from '@/src/components/shared/PrivacyToggleButton';
import { Icon, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

export type DashboardHeaderActionsProps = {
  onSearchPress: () => void;
  onReviewPress: () => void;
  insightCount: number;
  onSmsPress?: () => void;
  unreadSmsCount?: number;
};

export function DashboardHeaderActions({
  onSearchPress,
  onReviewPress,
  insightCount,
  onSmsPress,
  unreadSmsCount = 0,
}: DashboardHeaderActionsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.headerActions}>
      <IconButton
        name={Icon.Search}
        size={Size.iconSm}
        onPress={onSearchPress}
        accessibilityRole="button"
        accessibilityLabel="Search and Filter"
      />
      {onSmsPress ? (
        <View style={styles.badgeContainer}>
          <IconButton
            name={Icon.MessageSquare}
            size={Size.iconSm}
            onPress={onSmsPress}
            accessibilityRole="button"
            accessibilityLabel={
              unreadSmsCount > 0
                ? `View transaction inbox, ${unreadSmsCount} item${unreadSmsCount === 1 ? '' : 's'} need${unreadSmsCount === 1 ? 's' : ''} review`
                : 'View transaction inbox'
            }
          />
          {unreadSmsCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]} />
          ) : null}
        </View>
      ) : null}
      <View style={styles.badgeContainer}>
        <IconButton
          name={Icon.Sparkles}
          size={Size.iconSm}
          onPress={onReviewPress}
          accessibilityRole="button"
          accessibilityLabel={
            insightCount > 0
              ? `Open Review, ${insightCount} insight${insightCount === 1 ? '' : 's'}`
              : 'Open Review'
          }
        />
        {insightCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.error }]} />
        ) : null}
      </View>
      <PrivacyToggleButton />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  badgeContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Shape.radius.full,
  },
});
