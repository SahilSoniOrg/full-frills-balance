import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';

export interface SettingsViewProps {
  onPersonalization: () => void;
  onWorkplace: () => void;
  onAppearance: () => void;
  onAutomation: () => void;
  onPrivacy: () => void;
  onDataManagement: () => void;
  onMaintenance: () => void;
  onAbout: () => void;
}

export function SettingsView({
  onPersonalization,
  onWorkplace,
  onAppearance,
  onAutomation,
  onPrivacy,
  onDataManagement,
  onMaintenance,
  onAbout,
}: SettingsViewProps) {
  return (
    <SettingsLayout title="Settings" showBack={false}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.sections.moneySetup}>
          <SettingsMenuItem
            leftIcon="user"
            title={AppConfig.strings.settings.sections.personalization}
            description="Name, default currency, and Safe-to-Spend forecast"
            onPress={onPersonalization}
            prominent
          />
          <SettingsMenuItem
            leftIcon="briefcase"
            title="Workplace"
            description="Create and switch between workplaces"
            onPress={onWorkplace}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.experience}>
          <SettingsMenuItem
            leftIcon="palette"
            title={AppConfig.strings.settings.sections.appearance}
            description="Theme, typography, mode, and account card details"
            onPress={onAppearance}
            prominent
          />
          <SettingsMenuItem
            leftIcon="notifications"
            title={AppConfig.strings.settings.sections.remindersAndAutomation}
            description="Review reminders, SMS inbox, and auto-post rules"
            onPress={onAutomation}
            prominent
            testID="settings-automation"
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.protection}>
          <SettingsMenuItem
            leftIcon="shieldCheck"
            title={AppConfig.strings.settings.sections.privacyAndSecurity}
            description="Hide balances, protect widgets, and lock the app"
            onPress={onPrivacy}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.ledgerData}>
          <SettingsMenuItem
            leftIcon="database"
            title={AppConfig.strings.settings.sections.dataManagement}
            description="Back up, restore, share, and review your ledger"
            onPress={onDataManagement}
            prominent
          />
          <SettingsMenuItem
            leftIcon="wrench"
            title={AppConfig.strings.settings.sections.maintenanceAndReset}
            description="Verify books, purge deleted records, or reset the app"
            onPress={onMaintenance}
            prominent
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.app}>
          <SettingsMenuItem
            leftIcon="info"
            title={AppConfig.strings.settings.sections.aboutAndSupport}
            description="Community, ratings, source code, and version"
            onPress={onAbout}
            prominent
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
