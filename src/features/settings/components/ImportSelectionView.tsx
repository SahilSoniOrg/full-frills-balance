import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { ImportPluginCard } from '@/src/components/common/ImportPluginCard';
import type { ImportPlugin } from '@/src/services/import/types';
import type { ImportStats } from '@/src/contexts/app-shell/AppRestartProvider';
import { StyleSheet, View } from 'react-native';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { useTheme } from '@/src/hooks/use-theme';

interface ImportSelectionViewProps {
  plugins: ImportPlugin[];
  isImporting: boolean;
  progress: number;
  progressMessage?: string;
  onSelect: (id: string) => void;
  importStats: ImportStats | null;
  onImportComplete: () => void;
  onOpenImportedWorkplace: () => void;
  onStayOnCurrentWorkplace: () => void;
  isOnboardingImport: boolean;
  isNewWorkplace: boolean;
}

export function ImportSelectionView({
  plugins,
  isImporting,
  progress,
  progressMessage,
  onSelect,
  importStats,
  onImportComplete,
  onOpenImportedWorkplace,
  onStayOnCurrentWorkplace,
  isOnboardingImport,
  isNewWorkplace,
}: ImportSelectionViewProps) {
  const { theme } = useTheme();

  return (
    <SettingsLayout title={AppConfig.strings.settings.importTitle}>
      <View style={styles.container}>
        {importStats ? (
          <AppCard elevation="sm" paddingSize="lg" style={styles.completeCard}>
            <View style={styles.successMark}>
              <AppIcon name="check" size={Size.iconMd} color={theme.success} />
            </View>
            <AppText variant="heading" align="center" style={styles.completeTitle}>
              Import complete
            </AppText>
            <AppText variant="body" color="secondary" align="center" style={styles.completeText}>
              {isOnboardingImport
                ? 'Your workplace is ready. A few setup steps remain.'
                : 'A new Workplace was created. Your current one is unchanged.'}
            </AppText>
            <View style={[styles.statsGrid, { borderColor: theme.border }]}>
              <ImportStatRow label="Accounts" value={importStats.accounts} />
              <ImportStatRow label="Journals" value={importStats.journals} />
              <ImportStatRow label="Entries" value={importStats.transactions} />
              {typeof importStats.budgets === 'number' && (
                <ImportStatRow label="Budgets" value={importStats.budgets} />
              )}
              {typeof importStats.plannedPayments === 'number' && (
                <ImportStatRow label="Planned payments" value={importStats.plannedPayments} />
              )}
              {typeof importStats.auditLogs === 'number' && (
                <ImportStatRow label="Audit logs" value={importStats.auditLogs} />
              )}
              {importStats.skippedTransactions > 0 && (
                <ImportStatRow
                  label="Skipped items"
                  value={importStats.skippedTransactions}
                  warning
                />
              )}
              {importStats.preImportBackupPath ? (
                <ImportStatRow label="Safety backup" value="Created" />
              ) : null}
            </View>
            {isOnboardingImport ? (
              <AppButton variant="primary" onPress={onImportComplete}>
                Continue onboarding
              </AppButton>
            ) : (
              <View style={styles.actions}>
                <AppButton variant="primary" onPress={onOpenImportedWorkplace}>
                  Open imported Workplace
                </AppButton>
                <AppButton variant="outline" onPress={onStayOnCurrentWorkplace}>
                  Stay here
                </AppButton>
              </View>
            )}
          </AppCard>
        ) : null}

        {!importStats ? (
          <>
            <AppText variant="body" style={styles.intro}>
              {isNewWorkplace
                ? AppConfig.strings.settings.newWorkplaceImportIntro
                : AppConfig.strings.settings.importIntro}
            </AppText>

            {plugins.map((plugin, index) => (
              <ImportPluginCard
                key={plugin.id}
                plugin={plugin}
                index={index}
                onSelect={onSelect}
                isBusy={isImporting}
                testIDPrefix="import-plugin"
              />
            ))}

            <View style={styles.note}>
              <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                {isNewWorkplace
                  ? AppConfig.strings.settings.newWorkplaceImportNote
                  : AppConfig.strings.settings.importNote}
              </AppText>
            </View>
          </>
        ) : null}
      </View>

      <SettingsMaintenanceOverlay
        isVisible={isImporting}
        title="Importing Data"
        progress={progress}
        progressMessage={progressMessage || 'Restoring Backup...'}
        hint="This may take a few minutes for large backups. Please do not close the app."
        icon="refresh"
      />
    </SettingsLayout>
  );
}

function ImportStatRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number | string;
  warning?: boolean;
}) {
  return (
    <View style={styles.statTile}>
      <AppText variant="caption" color={warning ? 'warning' : 'secondary'}>
        {label}
      </AppText>
      <AppText variant="subheading" weight="bold" color={warning ? 'warning' : 'success'}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  intro: {
    marginBottom: Spacing.sm,
  },
  note: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  completeCard: {
    marginTop: Spacing.lg,
  },
  successMark: {
    alignSelf: 'center',
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    backgroundColor: '#E5F7EF',
  },
  completeTitle: {
    marginBottom: Spacing.xs,
  },
  completeText: {
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.sm,
  },
  statTile: {
    width: '47%',
    minHeight: Size.xl,
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
});
