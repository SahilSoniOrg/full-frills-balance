import { AppToggle } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { useDashboardPreferences } from '@/src/hooks/useDashboardPreferences';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { analytics } from '@/src/services/analytics-service';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export function SettingsView() {
  const { showSafeToSpendChart, setShowSafeToSpendChart } = useDashboardPreferences();

  const onToggleSafeToSpendChart = useCallback(
    (show: boolean) => {
      setShowSafeToSpendChart(show);
      analytics.trackFeatureUsage('settings', 'toggle_safe_to_spend_chart', {
        new_state: show,
      });
    },
    [setShowSafeToSpendChart],
  );

  return (
    <SettingsLayout title="Settings" showBack={false}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.sections.dashboard}>
          <SettingsMenuItem
            leftIcon="trendingUp"
            title={AppConfig.strings.settings.stsChart.title}
            description={AppConfig.strings.settings.stsChart.description}
            hasArrow={false}
            rightContent={
              <AppToggle value={showSafeToSpendChart} onValueChange={onToggleSafeToSpendChart} />
            }
            testID="settings-sts-chart-toggle"
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.moneySetup}>
          <SettingsMenuItem
            leftIcon="user"
            title={AppConfig.strings.settings.sections.personalization}
            description="Name, default currency, and Safe-to-Spend forecast"
            onPress={AppNavigation.toPersonalizationSettings}
            prominent
          />
          <SettingsMenuItem
            leftIcon="briefcase"
            title="Workplace"
            description="Create and switch between workplaces"
            onPress={AppNavigation.toWorkplaceSettings}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.experience}>
          <SettingsMenuItem
            leftIcon="palette"
            title={AppConfig.strings.settings.sections.appearance}
            description="Theme, typography, mode, and account card details"
            onPress={AppNavigation.toAppearanceSettings}
            prominent
          />
          <SettingsMenuItem
            leftIcon="notifications"
            title={AppConfig.strings.settings.sections.remindersAndAutomation}
            description="Review reminders, SMS inbox, and auto-post rules"
            onPress={AppNavigation.toAutomationSettings}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.protection}>
          <SettingsMenuItem
            leftIcon="shieldCheck"
            title={AppConfig.strings.settings.sections.privacyAndSecurity}
            description="Hide balances, protect widgets, and lock the app"
            onPress={AppNavigation.toPrivacySecuritySettings}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.ledgerData}>
          <SettingsMenuItem
            leftIcon="database"
            title={AppConfig.strings.settings.sections.dataManagement}
            description="Back up, restore, share, and review your ledger"
            onPress={AppNavigation.toDataManagementSettings}
            prominent
          />
          <SettingsMenuItem
            leftIcon="wrench"
            title={AppConfig.strings.settings.sections.maintenanceAndReset}
            description="Verify books, purge deleted records, or reset the app"
            onPress={AppNavigation.toMaintenanceSettings}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.app}>
          <SettingsMenuItem
            leftIcon="info"
            title={AppConfig.strings.settings.sections.aboutAndSupport}
            description="Community, ratings, source code, and version"
            onPress={AppNavigation.toAboutSupportSettings}
            prominent
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
