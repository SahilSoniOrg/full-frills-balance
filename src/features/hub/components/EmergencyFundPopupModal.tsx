import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface EmergencyFundPopupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateAccount: () => void;
}

export function EmergencyFundPopupModal({
  visible,
  onClose,
  onCreateAccount,
}: EmergencyFundPopupModalProps) {
  const { theme } = useTheme();
  const { emergencyFund: strings } = AppConfig.strings.dashboard.hub;

  return (
    <InfoSheet
      visible={visible}
      title={strings.title}
      onClose={onClose}
      maxHeightPercent={72}
      fixedHeight={false}
      scrollable={false}
      accessibilityCloseLabel={strings.title}
      secondaryAction={{ label: strings.actionClose, variant: 'secondary', onPress: onClose }}
      primaryAction={{ label: strings.actionCreate, variant: 'primary', onPress: onCreateAccount }}
    >
      <View style={styles.modalSection}>
        <AppText variant="body">{strings.description}</AppText>
      </View>

      <View style={[styles.modalHighlight, { backgroundColor: theme.surfaceSecondary }]}>
        <AppText variant="body" weight="medium" color="primary">
          {strings.highlight}
        </AppText>
      </View>

      <View style={styles.modalSection}>
        <AppText variant="heading">{strings.fixTitle}</AppText>
        <View style={styles.modalStepRow}>
          <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
          <AppText variant="caption" color="secondary" style={styles.modalStepText}>
            {strings.step1}
          </AppText>
        </View>
        <View style={styles.modalStepRow}>
          <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
          <AppText variant="caption" color="secondary" style={styles.modalStepText}>
            {strings.step2}
          </AppText>
        </View>
        <View style={styles.modalStepRow}>
          <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
          <AppText variant="caption" color="secondary" style={styles.modalStepText}>
            {strings.step3}
          </AppText>
        </View>
      </View>
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  modalSection: {
    gap: Spacing.xs,
  },
  modalHighlight: {
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
  },
  modalStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  modalStepText: {
    flex: 1,
  },
});
