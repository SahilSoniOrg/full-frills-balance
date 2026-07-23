import { AppText, IconButton } from '@/src/components/core';
import { Size } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PetEvolution, PetState } from '@/src/services/FinancialPetService';
import { StreakResult } from '@/src/services/StreakService';
import { Pressable, StyleSheet, View } from 'react-native';

const EVOLUTION_ICONS: Record<PetEvolution, string> = {
  [PetEvolution.Egg]: '🥚',
  [PetEvolution.Baby]: '🐣',
  [PetEvolution.Companion]: '🐱',
  [PetEvolution.Sage]: '🦉',
};

interface DashboardHeaderProps {
  greeting: string;
  notificationCount?: number;
  onNotificationsPress?: () => void;
  unreadSmsCount?: number;
  onSmsPress?: () => void;
  isPrivacyMode: boolean;
  onTogglePrivacy: () => void;
  onSearchPress?: () => void;
  petState?: PetState | null;
  streakState?: StreakResult | null;
  onPetPress?: () => void;
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
  petState,
  streakState,
  onPetPress,
}: DashboardHeaderProps) {
  const { theme } = useTheme();

  return (
    <Box marginBottom="sm">
      <Inline align="center" justify="space-between" space="md" marginBottom="md">
        <Box flex={1} style={{ minWidth: 0 }}>
          <AppText variant="title" numberOfLines={1}>
            {greeting}
          </AppText>

          {onPetPress && (
            <Pressable
              onPress={onPetPress}
              style={({ pressed }) => [
                styles.petHeaderPill,
                { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View Pet and Streak details"
            >
              <AppText style={{ fontSize: 13, marginRight: 4 }}>
                {EVOLUTION_ICONS[petState?.evolution ?? PetEvolution.Egg] || '🥚'}
              </AppText>
              <AppText variant="caption" weight="bold">
                Lvl {petState?.level ?? 1}
              </AppText>
              <View style={[styles.pillDivider, { backgroundColor: theme.border }]} />
              <AppText variant="caption" color="secondary">
                🔥 {streakState?.streakDays ?? 0}d
              </AppText>
              {!streakState?.todayLogged && (
                <View style={[styles.pendingDot, { backgroundColor: theme.warning }]} />
              )}
            </Pressable>
          )}
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
  petHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 8,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
});
