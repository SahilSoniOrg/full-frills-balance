import { AppButton, AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { Box, Column, Inline, Row, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PetEvolution, PetMood, PetState } from '@/src/services/FinancialPetService';
import { StreakResult } from '@/src/services/StreakService';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EVOLUTION_ICONS, getPetHealthColor, MOOD_EMOJIS } from '../utils/petPresenter';

export interface FinancialPetStreakCardProps {
  petState: PetState | null;
  streakState: StreakResult | null;
  onPressCard: () => void;
  onCheckInZeroSpend: () => void;
  isCheckInLoading?: boolean;
}

export const FinancialPetStreakCard: React.FC<FinancialPetStreakCardProps> = ({
  petState,
  streakState,
  onPressCard,
  onCheckInZeroSpend,
  isCheckInLoading = false,
}) => {
  const { theme } = useTheme();
  const { strings } = AppConfig;
  const petStrings = strings.dashboard.petAndStreak;

  const streakDays = streakState?.streakDays ?? 0;
  const todayLogged = streakState?.todayLogged ?? false;

  const level = petState?.level ?? 1;
  const xp = petState?.xp ?? 0;
  const xpToNextLevel = petState?.xpToNextLevel ?? 100;
  const health = petState?.health ?? 100;
  const mood = petState?.mood ?? PetMood.Happy;
  const evolution = petState?.evolution ?? PetEvolution.Egg;

  return (
    <Box marginTop="md">
      <AppCard style={styles.cardContainer}>
        <Pressable
          onPress={onPressCard}
          style={({ pressed }) => [styles.pressableArea, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel="Open Financial Pet and Streak Details"
        >
          <Stack gap="md">
            {/* Header: Pet Avatar, Title, Level & Streak Badge */}
            <Row align="center" justify="space-between">
              <Inline align="center" space="sm">
                <View
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                >
                  <AppText variant="heading" style={styles.avatarEmoji}>
                    {EVOLUTION_ICONS[evolution] || '🥚'}
                  </AppText>
                </View>
                <Column gap="xs">
                  <Inline align="center" space="xs">
                    <AppText variant="subheading" weight="bold" numberOfLines={1}>
                      {petStrings.evolution[evolution] || 'Companion'}
                    </AppText>
                    <Badge variant="primary">{petStrings.level(level)}</Badge>
                  </Inline>
                  <AppText variant="caption" color="secondary">
                    Mood: {MOOD_EMOJIS[mood] || '😊'} {mood.toUpperCase()}
                  </AppText>
                </Column>
              </Inline>

              <Inline align="center" space="xs">
                <View style={[styles.streakBadge, { backgroundColor: theme.primaryLight }]}>
                  <AppText variant="caption" weight="bold" style={{ color: theme.primary }}>
                    🔥 {petStrings.streakDays(streakDays)}
                  </AppText>
                </View>
                <AppIcon name="chevronRight" size={Size.xs} color={theme.textTertiary} />
              </Inline>
            </Row>

            {/* Health & XP Progress Bars */}
            <Column gap="xs">
              {/* Health Meter */}
              <Column gap="xs">
                <Row align="center" justify="space-between">
                  <AppText variant="caption" color="secondary">
                    {petStrings.health}
                  </AppText>
                  <AppText variant="caption" weight="bold">
                    {health}%
                  </AppText>
                </Row>
                <View style={[styles.progressTrack, { backgroundColor: theme.surfaceSecondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${health}%`, backgroundColor: getPetHealthColor(health, theme) },
                    ]}
                  />
                </View>
              </Column>

              {/* XP Meter */}
              <Column gap="xs">
                <Row align="center" justify="space-between">
                  <AppText variant="caption" color="secondary">
                    {petStrings.xp} ({xp} XP)
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {xpToNextLevel} XP left to Lvl {level + 1}
                  </AppText>
                </Row>
                <View style={[styles.progressTrack, { backgroundColor: theme.surfaceSecondary }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, Math.max(10, 100 - (xpToNextLevel / 100) * 100))}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
              </Column>
            </Column>

            {/* Quick Action: Zero-Spend Check-In if not logged today */}
            {!todayLogged ? (
              <Row align="center" justify="space-between" style={styles.actionRow}>
                <AppText variant="caption" color="secondary" style={{ flex: 1, paddingRight: 8 }}>
                  No transactions today? Keep your streak active!
                </AppText>
                <AppButton
                  size="sm"
                  variant="secondary"
                  onPress={onCheckInZeroSpend}
                  loading={isCheckInLoading}
                >
                  🌿 {petStrings.checkInZeroSpend}
                </AppButton>
              </Row>
            ) : (
              <Row align="center" justify="flex-start" style={styles.actionRow}>
                <AppIcon name="checkCircle" size={Size.xs} color={theme.success} />
                <AppText
                  variant="caption"
                  color="secondary"
                  style={{ marginLeft: 6, color: theme.success }}
                >
                  {petStrings.todayLogged} • Streak Active
                </AppText>
              </Row>
            )}
          </Stack>
        </Pressable>
      </AppCard>
    </Box>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    padding: 16,
    borderRadius: 16,
  },
  pressableArea: {
    width: '100%',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  streakBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  actionRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
});
