import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { JournalEntryScreenMode } from '../journalEntryPresentation';

interface AdvancedModeInfoModalProps {
  visible: boolean;
  onClose: () => void;
  /** Current entry mode (reserved for future per-mode help); advanced explanation is mode-agnostic. */
  mode: JournalEntryScreenMode;
}

/**
 * Help sheet for the journal entry mode bar. Shows the full Advanced Mode walkthrough
 * (example journal lines, balance rule, and when to use multi-line entry).
 */
export const AdvancedModeInfoModal = ({
  visible,
  onClose,
  mode: _mode,
}: AdvancedModeInfoModalProps) => {
  const { theme } = useTheme();
  const str = AppConfig.strings.advancedModeExplanation;

  return (
    <InfoSheet
      visible={visible}
      title={str.title}
      onClose={onClose}
      maxHeightPercent={85}
      accessibilityCloseLabel={AppConfig.strings.transactionFlow.modesHelpAccessibility}
      primaryAction={{ label: 'Got it!', variant: 'primary', onPress: onClose }}
    >
      <View style={styles.section}>
        <AppText variant="body">{str.intro}</AppText>
      </View>

      <View style={[styles.highlightSection, { backgroundColor: theme.surfaceSecondary }]}>
        <AppText variant="body" weight="medium" color="primary">
          {str.unlocks}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>
          {str.exampleTitle}
        </AppText>
        <AppText variant="body" style={styles.scenario}>
          {str.exampleScenario}
        </AppText>

        <View style={[styles.exampleBox, { borderColor: theme.border }]}>
          {str.exampleItems.map((item, index) => (
            <View key={index} style={styles.exampleItem}>
              <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="medium" style={{ flex: 1 }}>
                {item}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>
          {str.whyBetterTitle}
        </AppText>
        {str.benefits.map((benefit, index) => (
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
          {str.footer}
        </AppText>
      </View>
    </InfoSheet>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
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
  benefitItem: {
    marginBottom: Spacing.sm,
  },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
  },
});
