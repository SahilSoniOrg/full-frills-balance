import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { IconButton } from '@/src/components/core';
import { Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

export type DashboardHeaderActionsProps = {
  onSearchPress: () => void;
  onNotificationsPress: () => void;
  notificationCount: number;
  onSmsPress?: () => void;
  unreadSmsCount?: number;
};

export function DashboardHeaderActions({
  onSearchPress,
  onNotificationsPress,
  notificationCount,
  onSmsPress,
  unreadSmsCount = 0,
}: DashboardHeaderActionsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.headerActions}>
      <PrivacyToggleButton variant="clear" />
      <IconButton
        name="search"
        size={Size.iconSm}
        variant="clear"
        onPress={onSearchPress}
        accessibilityRole="button"
        accessibilityLabel="Search and Filter"
        iconColor={theme.text}
      />
      {onSmsPress ? (
        <View style={styles.badgeContainer}>
          <IconButton
            name="messageSquare"
            size={Size.iconSm}
            variant="clear"
            onPress={onSmsPress}
            accessibilityRole="button"
            accessibilityLabel="View SMS Inbox"
            iconColor={theme.text}
          />
          {unreadSmsCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]} />
          ) : null}
        </View>
      ) : null}
      <View style={styles.badgeContainer}>
        <IconButton
          name="sparkles"
          size={Size.iconSm}
          variant="clear"
          onPress={onNotificationsPress}
          accessibilityRole="button"
          accessibilityLabel="View Notifications"
          iconColor={theme.text}
        />
        {notificationCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.error }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
