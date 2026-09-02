import { AppConfig } from '@/src/constants';
import { WorkplaceSwitcher } from '@/src/components/common/WorkplaceSwitcher';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { Platform } from 'react-native';

export interface SettingsViewProps {
  onProfile: () => void;
  onAppearance: () => void;
  onAutomation: () => void;
  onPrivacy: () => void;
  onCurrentWorkplace: () => void;
  onDataManagement: () => void;
  onMaintenance: () => void;
  onAbout: () => void;
}

export function SettingsView({
  onProfile,
  onAppearance,
  onAutomation,
  onPrivacy,
  onCurrentWorkplace,
  onDataManagement,
  onMaintenance,
  onAbout,
}: SettingsViewProps) {
  const workplace = useOptionalWorkplace();
  const { data: currentWorkplace } = useWorkplaceSnapshot(workplace?.workplaceId);
  const notificationTitle =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.sections.remindersAndAutomation
      : AppConfig.strings.settings.notifications.title;
  const notificationDescription =
    Platform.OS === 'android'
      ? 'Reminders, SMS inbox, and auto-post rules'
      : 'Scheduled reminders to review recent activity';

  return (
    <SettingsLayout title="Settings" showBack={false} headerActions={<WorkplaceSwitcher />}>
      <Stack space="lg">
        <SettingsMenu header="Your Account">
          <SettingsMenuItem
            leftIcon="user"
            title={AppConfig.strings.settings.sections.profile}
            description="Your name and device settings"
            onPress={onProfile}
            testID="settings-profile"
          />
        </SettingsMenu>

        <SettingsMenu header="Workplaces">
          <SettingsMenuItem
            leftIcon="briefcase"
            title={currentWorkplace?.name ?? AppConfig.strings.settings.sections.currentWorkplace}
            description="Current workplace · Currency, Safe-to-Spend, and books"
            onPress={onCurrentWorkplace}
            testID="settings-current-workplace"
          />
        </SettingsMenu>

        <SettingsMenu header="Preferences">
          <SettingsMenuItem
            leftIcon="notifications"
            title={notificationTitle}
            description={notificationDescription}
            onPress={onAutomation}
            testID="settings-automation"
          />
          <SettingsMenuItem
            leftIcon="palette"
            title={AppConfig.strings.settings.sections.appearance}
            description="Theme, typography, time, and display options"
            onPress={onAppearance}
            testID="settings-appearance"
          />
          <SettingsMenuItem
            leftIcon="shieldCheck"
            title={AppConfig.strings.settings.sections.privacyAndSecurity}
            description="Hide balances, protect widgets, and lock the app"
            onPress={onPrivacy}
            testID="settings-privacy-security"
          />
        </SettingsMenu>

        <SettingsMenu header="Data">
          <SettingsMenuItem
            leftIcon="database"
            title={AppConfig.strings.settings.sections.dataManagement}
            description="Back up, restore, share, and review workplace data"
            onPress={onDataManagement}
            testID="settings-data-management"
          />
          <SettingsMenuItem
            leftIcon="wrench"
            title={AppConfig.strings.settings.sections.maintenanceAndReset}
            description="Verify books, purge deleted records, or reset the app"
            onPress={onMaintenance}
            testID="settings-maintenance"
          />
        </SettingsMenu>

        <SettingsMenu header="Support">
          <SettingsMenuItem
            leftIcon="info"
            title={AppConfig.strings.settings.sections.aboutAndSupport}
            description="Community, ratings, source code, and version"
            onPress={onAbout}
            prominent
            testID="settings-about-support"
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
