import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { Icon, AppIcon, AppText, type IconName } from '@/src/components/core';
import { ModalHost } from '@/src/components/overlays/ModalHost';
import { Opacity, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface SettingsMaintenanceOverlayProps {
  isVisible: boolean;
  title: string;
  progress: number;
  progressMessage?: string;
  hint?: string;
  icon?: IconName;
  onDismiss?: () => void;
}

export function SettingsMaintenanceOverlay({
  isVisible,
  title,
  progress,
  progressMessage,
  hint,
  icon = Icon.Document,
  onDismiss,
}: SettingsMaintenanceOverlayProps) {
  const { theme } = useTheme();

  return (
    <ModalHost
      visible={isVisible}
      useNativeModal={process.env.NODE_ENV !== 'test'}
      transparent
      animationType="fade"
      statusBarTranslucent
      onDismiss={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <View style={styles.modalIconRow}>
            <AppIcon name={icon} size={40} color={theme.primary} />
          </View>
          <AppText variant="subheading" style={styles.modalTitle}>
            {title}
          </AppText>
          <View style={styles.spinnerContainer}>
            <BudgetProgressBar
              progress={progress * 100}
              statusColor="primary"
              label={progressMessage}
              showPercentage
              style={styles.progressBar}
            />
          </View>
          {hint && (
            <AppText variant="caption" color="secondary" style={styles.modalHint}>
              {hint}
            </AppText>
          )}
        </View>
      </View>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: withOpacity('#000000', Opacity.heavy),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: Spacing.xl,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Opacity.muted,
    shadowRadius: 8,
  },
  modalIconRow: {
    marginBottom: Spacing.md,
  },
  modalTitle: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalHint: {
    textAlign: 'center',
    opacity: Opacity.medium,
    marginTop: Spacing.md,
  },
  spinnerContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  progressBar: {
    width: '100%',
  },
});
