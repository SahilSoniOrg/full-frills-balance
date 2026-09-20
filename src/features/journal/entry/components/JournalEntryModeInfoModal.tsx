import { AppIcon, AppText, Icon } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import type { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface JournalEntryModeInfoModalProps {
  visible: boolean;
  mode: JournalEntryScreenMode;
  isActive: boolean;
  canUseMode: boolean;
  onUseMode: (mode: JournalEntryScreenMode) => void;
  onClose: () => void;
}

type JournalEntryModeHelp = {
  title: string;
  intro: string;
  unlocks: string;
  exampleTitle: string;
  exampleScenario: string;
  exampleItems: readonly string[];
  whyBetterTitle: string;
  benefits: readonly string[];
  footer: string;
};

const MODE_HELP_BY_ID = {
  basic: AppConfig.strings.journalEntryModesHelp.guided,
  allocation: AppConfig.strings.journalEntryModesHelp.split,
  expert: AppConfig.strings.advancedModeExplanation,
  batch: AppConfig.strings.journalEntryModesHelp.bulk,
} satisfies Record<JournalEntryScreenMode, JournalEntryModeHelp>;

export function JournalEntryModeInfoModal({
  visible,
  mode,
  isActive,
  canUseMode,
  onUseMode,
  onClose,
}: JournalEntryModeInfoModalProps) {
  const { theme } = useTheme();
  const details = MODE_HELP_BY_ID[mode];
  const isAdvancedMode = mode === 'expert';

  return (
    <InfoSheet
      visible={visible}
      title={details.title}
      onClose={onClose}
      maxHeightPercent={isAdvancedMode ? 85 : 72}
      accessibilityCloseLabel={
        isAdvancedMode
          ? AppConfig.strings.transactionFlow.modesHelpAccessibility
          : AppConfig.strings.transactionFlow.closeModeHelpAccessibility
      }
      primaryAction={{
        label: isActive ? 'Done' : canUseMode ? `Use ${details.title}` : 'Advanced required',
        variant: 'primary',
        disabled: !isActive && !canUseMode,
        onPress: () => {
          if (!isActive && canUseMode) onUseMode(mode);
          onClose();
        },
      }}
    >
      <View style={styles.section}>
        <AppText variant="body">{details.intro}</AppText>
      </View>

      <View style={[styles.highlightSection, { backgroundColor: theme.surfaceSecondary }]}>
        <AppText variant="body" weight="medium" color="primary">
          {details.unlocks}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>
          {details.exampleTitle}
        </AppText>
        <AppText variant="body" style={styles.scenario}>
          {details.exampleScenario}
        </AppText>

        <View style={[styles.exampleBox, { borderColor: theme.border }]}>
          {details.exampleItems.map((item, index) => (
            <View key={index} style={styles.exampleItem}>
              <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="medium" style={styles.exampleItemText}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>
          {details.whyBetterTitle}
        </AppText>
        {details.benefits.map((benefit, index) => (
          <View key={index} style={styles.benefitItem}>
            <AppText variant="body" color="secondary">
              {benefit}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <AppText
          variant="caption"
          italic
          style={{ color: theme.textSecondary, textAlign: 'center' }}
        >
          {details.footer}
        </AppText>
      </View>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sizes.base,
  },
  highlightSection: {
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
  },
  scenario: {
    opacity: Opacity.soft,
  },
  exampleBox: {
    borderWidth: 1,
    borderRadius: Shape.radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  exampleItemText: {
    flex: 1,
  },
  benefitItem: {
    marginBottom: Spacing.sm,
  },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
  },
});
