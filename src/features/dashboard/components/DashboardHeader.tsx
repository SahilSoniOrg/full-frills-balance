import { AppText, IconButton } from '@/src/components/core';
import { Size } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface DashboardHeaderProps {
  greeting: string;
  notificationCount?: number;
  onNotificationsPress?: () => void;
  unreadSmsCount?: number;
  onSmsPress?: () => void;
  isPrivacyMode: boolean;
  onTogglePrivacy: () => void;
  onSearchPress?: () => void;
}

export function DashboardHeader({
  greeting,
  notificationCount = 0,
  onNotificationsPress,
  unreadSmsCount = 0,
  onSmsPress,
  isPrivacyMode,
  onTogglePrivacy,
  onSearchPress,
}: DashboardHeaderProps) {
  const { theme } = useTheme();

  return (
    <Box marginBottom="sm">
      <Inline align="center" justify="space-between" space="md" marginBottom="lg">
        <Box flex={1} style={{ minWidth: 0 }}>
          <AppText variant="title" numberOfLines={1}>
            {greeting}
          </AppText>
        </Box>

        <Inline align="center" space="xs">
          <IconButton
            name={isPrivacyMode ? 'eyeOff' : 'eye'}
            size={Size.iconSm}
            variant="clear"
            onPress={onTogglePrivacy}
            accessibilityLabel={isPrivacyMode ? 'Show balances' : 'Hide balances'}
            iconColor={theme.text}
          />
          {onSearchPress && (
            <IconButton
              name="search"
              size={Size.iconSm}
              variant="clear"
              onPress={onSearchPress}
              accessibilityRole="button"
              accessibilityLabel="Search and Filter"
              iconColor={theme.text}
            />
          )}
          {onSmsPress && (
            <View style={styles.bellContainer}>
              <IconButton
                name="messageSquare"
                size={Size.iconSm}
                variant="clear"
                onPress={onSmsPress}
                accessibilityRole="button"
                accessibilityLabel="View SMS Inbox"
                iconColor={theme.text}
              />
              {unreadSmsCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.primary }]} />
              )}
            </View>
          )}
          {onNotificationsPress && (
            <View style={styles.bellContainer}>
              <IconButton
                name="sparkles"
                size={Size.iconSm}
                variant="clear"
                onPress={onNotificationsPress}
                accessibilityRole="button"
                accessibilityLabel="View Notifications"
                iconColor={theme.text}
              />
              {notificationCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.error }]} />
              )}
            </View>
          )}
        </Inline>
      </Inline>
    </Box>
  );
}

const styles = StyleSheet.create({
  bellContainer: {
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
