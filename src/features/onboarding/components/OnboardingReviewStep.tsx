import { AppButton, AppCard, AppIcon, AppText, IconName } from '@/src/components/core';
import { AppConfig, FontId, FontIds, Size, Spacing, ThemeId, ThemeIds } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface OnboardingReviewStepProps {
  name: string;
  workplaceName: string;
  workplaceIcon: IconName;
  selectedCurrency: string;
  accountCount: number;
  categoryCount: number;
  themeId: ThemeId;
  fontId: FontId;
  onChangeProfile: () => void;
  onChangeWorkplace: () => void;
  onChangeCurrency: () => void;
  onChangeAccounts: () => void;
  onChangeCategories: () => void;
  onChangeAppearance: () => void;
  onConfirm: () => void;
  onBack: () => void;
  isCompleting: boolean;
  isImportedWorkplace?: boolean;
  showAppearance?: boolean;
  showProfile?: boolean;
  workplaceEditable?: boolean;
}

const THEME_LABELS: Record<ThemeId, string> = {
  [ThemeIds.DEEP_SPACE]: AppConfig.strings.settings.appearance.deepSpace.label,
  [ThemeIds.GOLD_OBSIDIAN]: AppConfig.strings.settings.appearance.goldObsidian.label,
  [ThemeIds.IVY]: AppConfig.strings.settings.appearance.ivy.label,
  [ThemeIds.EDITORIAL]: AppConfig.strings.settings.appearance.editorial.label,
};

const FONT_LABELS: Record<FontId, string> = {
  [FontIds.DEEP_SPACE]: AppConfig.strings.settings.appearance.serifSans.label,
  [FontIds.IVY]: AppConfig.strings.settings.appearance.modernGeometric.label,
  [FontIds.EDITORIAL]: AppConfig.strings.settings.appearance.classicSerif.label,
};

function ReviewRow({
  label,
  value,
  onChange,
  icon,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: () => void;
  icon?: IconName;
  editable?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Inline
      align="center"
      justify="space-between"
      space="md"
      style={[styles.row, { borderBottomColor: theme.border }]}
    >
      <Inline align="center" space="sm" style={styles.rowValue}>
        {icon && <AppIcon name={icon} size={Size.sm} color={theme.primary} />}
        <Stack space="xs" style={styles.rowText}>
          <AppText variant="caption" color="secondary">
            {label}
          </AppText>
          <AppText weight="semibold" numberOfLines={2}>
            {value}
          </AppText>
        </Stack>
      </Inline>
      {editable && (
        <TouchableOpacity
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel={`${AppConfig.strings.onboarding.review.change} ${label}`}
          style={styles.changeButton}
        >
          <AppText variant="caption" weight="semibold" style={{ color: theme.primary }}>
            {AppConfig.strings.onboarding.review.change}
          </AppText>
        </TouchableOpacity>
      )}
    </Inline>
  );
}

function ReviewMetric({
  label,
  value,
  onChange,
  editable,
}: {
  label: string;
  value: string;
  onChange: () => void;
  editable: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onChange}
      disabled={!editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={
        editable ? `${AppConfig.strings.onboarding.review.change} ${label}` : undefined
      }
      style={styles.metric}
    >
      <AppText variant="caption" color="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText weight="semibold" numberOfLines={1}>
        {value}
      </AppText>
      {editable && (
        <AppText variant="caption" weight="semibold" style={{ color: theme.primary }}>
          {AppConfig.strings.onboarding.review.change}
        </AppText>
      )}
    </TouchableOpacity>
  );
}

export function OnboardingReviewStep({
  name,
  workplaceName,
  workplaceIcon,
  selectedCurrency,
  accountCount,
  categoryCount,
  themeId,
  fontId,
  onChangeProfile,
  onChangeWorkplace,
  onChangeCurrency,
  onChangeAccounts,
  onChangeCategories,
  onChangeAppearance,
  onConfirm,
  onBack,
  isCompleting,
  isImportedWorkplace = false,
  showAppearance = true,
  showProfile = true,
  workplaceEditable,
}: OnboardingReviewStepProps) {
  const strings = AppConfig.strings.onboarding.review;
  const { theme } = useTheme();
  const canEditWorkplace = workplaceEditable ?? !isImportedWorkplace;

  return (
    <Box flex={1}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Stack space="xs" align="center" style={styles.header}>
          <AppText variant="title" style={styles.centered}>
            {strings.title}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.centered}>
            {strings.subtitle}
          </AppText>
        </Stack>

        <Box background="surfaceSecondary" borderRadius="r2" padding="md" marginBottom="md">
          <Inline align="center" space="sm">
            <AppIcon name="checkCircle" size={Size.sm} color="primary" />
            <Stack space="xs" style={styles.readyText}>
              <AppText weight="semibold">Almost ready</AppText>
              <AppText variant="caption" color="secondary">
                {isImportedWorkplace
                  ? 'Confirm to enter the app. You can edit imported data later in Settings.'
                  : 'Confirm to create your workspace and enter the app.'}
              </AppText>
            </Stack>
          </Inline>
        </Box>

        <AppCard variant="outline" paddingSize="none">
          {showProfile ? (
            <ReviewRow
              label={strings.profile}
              value={name}
              onChange={onChangeProfile}
              icon="user"
            />
          ) : null}
          <ReviewRow
            label={strings.workplace}
            value={workplaceName}
            onChange={onChangeWorkplace}
            icon={workplaceIcon}
            editable={canEditWorkplace}
          />
          <Box padding="md" style={[styles.financialSection, { borderBottomColor: theme.border }]}>
            <AppText variant="caption" color="secondary">
              Financial setup
            </AppText>
            <Inline space="sm" style={styles.metrics}>
              <ReviewMetric
                label={strings.currency}
                value={selectedCurrency}
                onChange={onChangeCurrency}
                editable={!isImportedWorkplace}
              />
              <ReviewMetric
                label={strings.accounts}
                value={`${accountCount}`}
                onChange={onChangeAccounts}
                editable={!isImportedWorkplace}
              />
              <ReviewMetric
                label={strings.categories}
                value={`${categoryCount}`}
                onChange={onChangeCategories}
                editable={!isImportedWorkplace}
              />
            </Inline>
          </Box>
          {showAppearance && (
            <ReviewRow
              label={strings.appearance}
              value={`${THEME_LABELS[themeId]} · ${FONT_LABELS[fontId]}`}
              onChange={onChangeAppearance}
              icon="palette"
            />
          )}
        </AppCard>
      </ScrollView>

      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="md">
        <Stack space="xs">
          <AppButton
            variant="primary"
            size="lg"
            onPress={onConfirm}
            loading={isCompleting}
            disabled={isCompleting}
            testID="onboarding-finish-button"
          >
            {isCompleting ? strings.confirming : strings.confirm}
          </AppButton>
          <AppButton variant="ghost" size="md" onPress={onBack} disabled={isCompleting}>
            Back
          </AppButton>
        </Stack>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  centered: {
    textAlign: 'center',
  },
  readyText: {
    flex: 1,
  },
  financialSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metrics: {
    marginTop: Spacing.sm,
  },
  metric: {
    flex: 1,
    minHeight: Size.touchTargetLg,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  row: {
    minHeight: Size.touchTargetLg + Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowValue: {
    flex: 1,
  },
  rowText: {
    flex: 1,
  },
  changeButton: {
    minHeight: Size.buttonMd,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
});
