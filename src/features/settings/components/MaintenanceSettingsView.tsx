import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection as SettingsMenu } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem as SettingsMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';
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
      <SettingsMenu header={AppConfig.strings.settings.sections.maintenance}>
        <SettingsMenuItem
          searchId="integrity"
          leftIcon={Icon.Search}
          title={AppConfig.strings.settings.maintenance.integrityBtn}
          description={AppConfig.strings.settings.maintenance.integrityDesc}
          onPress={vm.onFixIntegrity}
          loading={vm.isMaintenanceMode}
        />
        <SettingsMenuItem
          searchId="journal-balance-audit"
          leftIcon={Icon.Scale}
          title={AppConfig.strings.settings.maintenance.balanceAuditBtn}
          description={AppConfig.strings.settings.maintenance.balanceAuditDesc}
          onPress={vm.onAuditJournalBalances}
          loading={vm.isAuditingBalances}
        />
        {__DEV__ && (
          <SettingsMenuItem
            searchId="seed-mock-data"
            leftIcon={Icon.Database}
            title={AppConfig.strings.settings.maintenance.seedMockBtn}
            description={AppConfig.strings.settings.maintenance.seedMockDesc}
            onPress={vm.onSeedMockData}
            loading={vm.isSeeding}
          />
        )}
        <SettingsMenuItem
          searchId="cleanup"
          leftIcon={Icon.Delete}
          title={AppConfig.strings.settings.danger.cleanupBtn}
          description={AppConfig.strings.settings.danger.cleanupDesc}
          onPress={vm.onCleanup}
          loading={vm.isCleaning}
        />
      </SettingsMenu>

      <SettingsMenu header={AppConfig.strings.settings.sections.dangerZone}>
        <SettingsMenuItem
          searchId="reset"
          leftIcon={Icon.Alert}
          title={AppConfig.strings.settings.danger.resetBtn}
          description={AppConfig.strings.settings.danger.resetDesc}
          onPress={vm.onFactoryReset}
          loading={vm.isResetting}
          testID="factory-reset-button"
          danger
        />
      </SettingsMenu>

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
