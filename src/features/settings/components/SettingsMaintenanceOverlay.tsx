import { ProgressBar } from '@/src/components/common/ProgressBar';
import { AppIcon, AppText, type IconName } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Modal, StyleSheet, View } from 'react-native';

interface SettingsMaintenanceOverlayProps {
  isVisible: boolean;
  title: string;
  progress: number;
  progressMessage?: string;
  hint?: string;
  icon?: IconName;
}

export function SettingsMaintenanceOverlay({
  isVisible,
  title,
  progress,
  progressMessage,
  hint,
  icon = 'document',
}: SettingsMaintenanceOverlayProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={isVisible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <View style={styles.modalIconRow}>
            <AppIcon name={icon} size={40} color={theme.primary} />
          </View>
          <AppText variant="subheading" style={styles.modalTitle}>
            {title}
          </AppText>
          <View style={styles.spinnerContainer}>
            <ProgressBar progress={progress} label={progressMessage} style={styles.progressBar} />
          </View>
          {hint && (
            <AppText variant="caption" color="secondary" style={styles.modalHint}>
              {hint}
            </AppText>
          )}
        </View>
      </View>
    </Modal>
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
