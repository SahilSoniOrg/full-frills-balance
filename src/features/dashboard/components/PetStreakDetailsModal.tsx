import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppButton, AppIcon, AppText, Badge } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { Column, Inline, Row, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PetEvolution, PetMood, PetState } from '@/src/services/FinancialPetService';
import { StreakResult } from '@/src/services/StreakService';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { EVOLUTION_ICONS, getPetHealthColor, MOOD_EMOJIS } from '../utils/petPresenter';

export interface PetStreakDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  petState: PetState | null;
  streakState: StreakResult | null;
  onCheckInZeroSpend: () => void;
  isCheckInLoading?: boolean;
}

export const PetStreakDetailsModal: React.FC<PetStreakDetailsModalProps> = ({
  visible,
  onClose,
  petState,
  streakState,
  onCheckInZeroSpend,
  isCheckInLoading = false,
}) => {
  const { theme } = useTheme();
  const { strings } = AppConfig;
  const petStrings = strings.dashboard.petAndStreak;

  const streakDays = streakState?.streakDays ?? 0;
  const todayLogged = streakState?.todayLogged ?? false;
  const lastLoggedDate = streakState?.lastLoggedDate ?? '';

  const level = petState?.level ?? 1;
  const xp = petState?.xp ?? 0;
  const xpToNextLevel = petState?.xpToNextLevel ?? 100;
  const health = petState?.health ?? 100;
  const mood = petState?.mood ?? PetMood.Happy;
  const evolution = petState?.evolution ?? PetEvolution.Egg;

  const formattedLastLoggedDate = useMemo(() => {
    if (!lastLoggedDate) return '';
    const cleanDate = lastLoggedDate.includes('T') ? lastLoggedDate.split('T')[0] : lastLoggedDate;
    const todayStr = new Date().toISOString().split('T')[0];
    if (cleanDate === todayStr) {
      return 'Today';
    }
    return cleanDate;
  }, [lastLoggedDate]);

  return (
    <InfoSheet
      visible={visible}
      title={petStrings.modalTitle}
      onClose={onClose}
      maxHeightPercent={90}
      fixedHeight={false}
      accessibilityCloseLabel="Close modal"
      primaryAction={{
        label: 'Done',
        onPress: onClose,
        variant: 'primary',
      }}
    >
      <Stack gap="lg" style={{ paddingBottom: 60 }}>
        {/* Hero Section: Avatar, Stage & Mood Pill */}
        <View
          style={[
            styles.heroBox,
            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
          ]}
        >
          <Stack gap="md" style={{ alignItems: 'center' }}>
            <View style={[styles.avatarCircle, { borderColor: theme.primary }]}>
              <AppText style={styles.avatarEmoji}>{EVOLUTION_ICONS[evolution] || '🥚'}</AppText>
            </View>

            <Column gap="xs" style={{ alignItems: 'center' }}>
              <Inline align="center" space="xs">
                <AppText variant="title" weight="bold">
                  {petStrings.evolution[evolution] || 'Companion'}
                </AppText>
                <Badge variant="primary">{petStrings.level(level)}</Badge>
              </Inline>

              <View style={[styles.moodTag, { backgroundColor: theme.primaryLight }]}>
                <AppText variant="caption" weight="bold" style={{ color: theme.primary }}>
                  {MOOD_EMOJIS[mood]} {mood.toUpperCase()}
                </AppText>
              </View>
            </Column>
          </Stack>
        </View>

        {/* Health & XP Metric Cards */}
        <View style={styles.metricsGrid}>
          {/* Health Block */}
          <View
            style={[
              styles.metricCard,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <Stack gap="xs">
              <Row align="center" justify="space-between">
                <AppText variant="caption" color="secondary">
                  Overall Health
                </AppText>

                <AppText
                  variant="subheading"
                  weight="bold"
                  style={{ color: getPetHealthColor(health, theme) }}
                >
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

              <AppText variant="caption" color="tertiary" style={{ fontSize: 11 }}>
                60% budget + 40% inbox triage
              </AppText>
            </Stack>
          </View>

          {/* XP Progress Block */}
          <View
            style={[
              styles.metricCard,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <Stack gap="xs">
              <Row align="center" justify="space-between">
                <AppText variant="caption" color="secondary">
                  Experience
                </AppText>
                <AppText variant="subheading" weight="bold">
                  {xp} XP
                </AppText>
              </Row>

              <View style={styles.progressTrack}>
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

              <AppText variant="caption" color="tertiary" style={{ fontSize: 11 }}>
                {xpToNextLevel} XP left to Lvl {level + 1}
              </AppText>
            </Stack>
          </View>
        </View>

        {/* Streak & Daily Check-In Hero Card */}
        <View
          style={[
            styles.streakHeroCard,
            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
          ]}
        >
          <Stack gap="md">
            <Stack gap="xs">
              <Row align="center" justify="space-between">
                <Inline align="center" space="xs">
                  <AppIcon name="zap" size={Size.sm} color={theme.warning} />
                  <AppText variant="subheading" weight="bold">
                    Daily Streak
                  </AppText>
                </Inline>

                <View style={[styles.streakBadgePill, { backgroundColor: theme.primaryLight }]}>
                  <AppText variant="caption" weight="bold" style={{ color: theme.primary }}>
                    🔥 {petStrings.streakDays(streakDays)}
                  </AppText>
                </View>
              </Row>

              {formattedLastLoggedDate ? (
                <AppText variant="caption" color="tertiary" style={{ fontSize: 11 }}>
                  Last activity: {formattedLastLoggedDate}
                </AppText>
              ) : null}
            </Stack>

            <AppText variant="caption" color="secondary">
              {todayLogged ? petStrings.streakLoggedMessage : petStrings.streakActiveSubtitle}
            </AppText>

            {!todayLogged ? (
              <AppButton
                variant="primary"
                onPress={onCheckInZeroSpend}
                loading={isCheckInLoading}
                style={{ marginTop: 4 }}
              >
                🌿 {petStrings.checkInZeroSpend}
              </AppButton>
            ) : (
              <Row
                align="center"
                justify="center"
                style={[styles.loggedBadgeRow, { backgroundColor: theme.successLight }]}
              >
                <AppIcon name="checkCircle" size={Size.xs} color={theme.success} />
                <AppText
                  variant="caption"
                  weight="bold"
                  style={{ marginLeft: 6, color: theme.success }}
                >
                  {petStrings.todayLogged} • Streak Active
                </AppText>
              </Row>
            )}
          </Stack>
        </View>

        {/* How to Earn XP Section */}
        <Stack gap="sm">
          <AppText variant="subheading" weight="bold" style={{ marginLeft: 4 }}>
            {petStrings.howToEarnXp}
          </AppText>

          <Column gap="xs">
            <Row
              align="center"
              justify="flex-start"
              style={[styles.tipTile, { backgroundColor: theme.surfaceSecondary }]}
            >
              <View style={[styles.tipIconBadge, { backgroundColor: theme.surface }]}>
                <AppText style={{ fontSize: 16 }}>⚡</AppText>
              </View>
              <AppText variant="caption" color="secondary" style={{ flex: 1, marginLeft: 10 }}>
                {petStrings.tipLogTransaction}
              </AppText>
            </Row>

            <Row
              align="center"
              justify="flex-start"
              style={[styles.tipTile, { backgroundColor: theme.surfaceSecondary }]}
            >
              <View style={[styles.tipIconBadge, { backgroundColor: theme.surface }]}>
                <AppText style={{ fontSize: 16 }}>✉️</AppText>
              </View>
              <AppText variant="caption" color="secondary" style={{ flex: 1, marginLeft: 10 }}>
                {petStrings.tipReviewSms}
              </AppText>
            </Row>

            <Row
              align="center"
              justify="flex-start"
              style={[styles.tipTile, { backgroundColor: theme.surfaceSecondary }]}
            >
              <View style={[styles.tipIconBadge, { backgroundColor: theme.surface }]}>
                <AppText style={{ fontSize: 16 }}>🔥</AppText>
              </View>
              <AppText variant="caption" color="secondary" style={{ flex: 1, marginLeft: 10 }}>
                {petStrings.tipStreakMilestone}
              </AppText>
            </Row>

            <Row
              align="center"
              justify="flex-start"
              style={[styles.tipTile, { backgroundColor: theme.surfaceSecondary }]}
            >
              <View style={[styles.tipIconBadge, { backgroundColor: theme.surface }]}>
                <AppText style={{ fontSize: 16 }}>🌿</AppText>
              </View>
              <AppText variant="caption" color="secondary" style={{ flex: 1, marginLeft: 10 }}>
                {petStrings.tipZeroSpend}
              </AppText>
            </Row>
          </Column>
        </Stack>
      </Stack>
    </InfoSheet>
  );
};

const styles = StyleSheet.create({
  heroBox: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 40,
    lineHeight: 44,
  },
  moodTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  metricsGrid: {
    gap: 12,
  },
  metricCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
    marginVertical: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  streakHeroCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  streakBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loggedBadgeRow: {
    paddingVertical: 10,
    borderRadius: 12,
  },
  tipTile: {
    padding: 10,
    borderRadius: 14,
  },
  tipIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
