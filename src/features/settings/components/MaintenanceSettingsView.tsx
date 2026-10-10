import { ListGroup, ListRow } from '@/src/components/core';
import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMaintenanceOverlay } from '@/src/features/settings/components/SettingsMaintenanceOverlay';
import { useDataMaintenanceActions } from '@/src/features/settings/hooks/useDataMaintenanceActions';
import { analytics } from '@/src/services/analytics';
import {
  cleanupDatabase as cleanupDatabaseRecords,
  forceRunCheck,
  journalBalanceInsightService,
  resetDatabase,
} from '@/src/services/integrity';
import { AppNavigation } from '@/src/utils/navigation';
import { toast } from '@/src/utils/alerts';
import { useCallback } from 'react';

function MaintenanceSettingsView() {
  const { workplaceId } = useWorkplace();
  const { requireRestart } = useAppRestart();

  const runIntegrityCheck = useCallback(
    async (onProgress?: (message: string, progress: number) => void) => {
      return forceRunCheck(workplaceId, onProgress);
    },
    [workplaceId],
  );

  const findUnbalancedJournals = useCallback(
    () => journalBalanceInsightService.refresh(workplaceId, 'maintenance'),
    [workplaceId],
  );

  const reviewUnbalancedJournals = useCallback(() => {
    analytics.track('entrypoint_selected', {
      screen: 'settings_maintenance',
      entrypoint: 'balance_audit',
      target: 'journal_balance_review',
    });
    AppNavigation.toJournalBalanceReview();
  }, []);

  const cleanupDatabase = useCallback(() => cleanupDatabaseRecords(), []);

  const resetApp = useCallback(async () => {
    analytics.track('factory_reset');
    const result = await resetDatabase();
    if (result.warnings.length > 0) {
      toast.warning(
        'Your data was reset. Some cached displays could not be cleared and may need a restart.',
      );
    }
    requireRestart({ type: 'RESET' });
  }, [requireRestart]);

  const vm = useDataMaintenanceActions({
    runIntegrityCheck,
    findUnbalancedJournals,
    reviewUnbalancedJournals,
    cleanupDatabase,
    resetApp,
    requireRestart,
  });

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.maintenanceAndReset}>
      <ListGroup variant="plain" header={AppConfig.strings.settings.sections.maintenance}>
        <ListRow
          focusId="integrity"
          icon={Icon.Search}
          title={AppConfig.strings.settings.maintenance.integrityBtn}
          subtitle={AppConfig.strings.settings.maintenance.integrityDesc}
          onPress={vm.onFixIntegrity}
          trailing={vm.isMaintenanceMode && <ListRow.Spinner />}
        />
        <ListRow
          focusId="journal-balance-audit"
          icon={Icon.Scale}
          title={AppConfig.strings.settings.maintenance.balanceAuditBtn}
          subtitle={AppConfig.strings.settings.maintenance.balanceAuditDesc}
          onPress={vm.onAuditJournalBalances}
          trailing={vm.isAuditingBalances && <ListRow.Spinner />}
        />
        {__DEV__ && (
          <ListRow
            focusId="seed-mock-data"
            icon={Icon.Database}
            title={AppConfig.strings.settings.maintenance.seedMockBtn}
            subtitle={AppConfig.strings.settings.maintenance.seedMockDesc}
            onPress={vm.onSeedMockData}
            trailing={vm.isSeeding && <ListRow.Spinner />}
          />
        )}
        <ListRow
          focusId="cleanup"
          icon={Icon.Delete}
          title={AppConfig.strings.settings.danger.cleanupBtn}
          subtitle={AppConfig.strings.settings.danger.cleanupDesc}
          onPress={vm.onCleanup}
          trailing={vm.isCleaning && <ListRow.Spinner />}
        />
      </ListGroup>

      <ListGroup variant="plain" header={AppConfig.strings.settings.sections.dangerZone}>
        <ListRow
          focusId="reset"
          icon={Icon.Alert}
          title={AppConfig.strings.settings.danger.resetBtn}
          subtitle={AppConfig.strings.settings.danger.resetDesc}
          onPress={vm.onFactoryReset}
          trailing={vm.isResetting && <ListRow.Spinner />}
          testID="factory-reset-button"
          destructive
        />
      </ListGroup>

      <SettingsMaintenanceOverlay
        isVisible={vm.isMaintenanceMode}
        title={AppConfig.strings.settings.maintenance.integrityTitle}
        progress={vm.integrityProgress}
        progressMessage={vm.integrityProgressMessage}
        hint={AppConfig.strings.settings.maintenance.integrityHint}
        icon={Icon.Search}
      />

      <SettingsMaintenanceOverlay
        isVisible={vm.isSeeding}
        title={AppConfig.strings.settings.maintenance.seedMockTitle}
        progress={vm.seedingProgress}
        progressMessage={vm.seedingProgressMessage}
        hint={AppConfig.strings.settings.maintenance.seedMockHint}
        icon={Icon.Database}
      />
    </SettingsLayout>
  );
}

export default MaintenanceSettingsView;
