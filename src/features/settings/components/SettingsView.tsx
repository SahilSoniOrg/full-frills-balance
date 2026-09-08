import { AppConfig } from '@/src/constants';
import { WorkplaceSwitcher } from '@/src/components/workplace/WorkplaceSwitcher';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { Platform, TextInput } from 'react-native';
import { SettingsSearchResults } from '@/src/features/settings/components/SettingsSearchResults';
import { createSettingsSearchCatalog } from '@/src/features/settings/components/settingsSearchCatalog';
import { useMemo, useRef, useState } from 'react';

export interface SettingsViewProps {
  onProfile: () => void;
  onAppearance: () => void;
  onAutomation: () => void;
  onPrivacy: () => void;
  onPrivacyNotice: () => void;
  onCurrentWorkplace: () => void;
  onDataManagement: () => void;
  onMaintenance: () => void;
  onAbout: () => void;
  onDeviceSettings: () => void;
}

export function SettingsView({
  onProfile,
  onAppearance,
  onAutomation,
  onPrivacy,
  onPrivacyNotice,
  onCurrentWorkplace,
  onDataManagement,
  onMaintenance,
  onAbout,
  onDeviceSettings,
}: SettingsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const searchItems = useMemo(
    () =>
      createSettingsSearchCatalog({
        onProfile,
        onAppearance,
        onAutomation,
        onPrivacy,
        onPrivacyNotice,
        onCurrentWorkplace,
        onDataManagement,
        onMaintenance,
        onAbout,
        onDeviceSettings,
      }),
    [
      onAbout,
      onAppearance,
      onAutomation,
      onCurrentWorkplace,
      onDataManagement,
      onDeviceSettings,
      onMaintenance,
      onPrivacy,
      onPrivacyNotice,
      onProfile,
    ],
  );
  const workplace = useOptionalWorkplace();
  const { data: currentWorkplace } = useWorkplaceSnapshot(workplace?.workplaceId);
  const notificationTitle =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.notifications.automationTitle
      : AppConfig.strings.settings.notifications.title;
  const notificationDescription =
    Platform.OS === 'android'
      ? AppConfig.strings.settings.notifications.automationDescription
      : AppConfig.strings.settings.notifications.description;

  return (
    <SettingsLayout
      title="Settings"
      showBack={false}
      headerActions={<WorkplaceSwitcher />}
      scrollViewProps={{ onScrollBeginDrag: () => searchInputRef.current?.blur() }}
    >
      <Stack space="lg">
        <SettingsSearchResults
          query={searchQuery}
          onQueryChange={setSearchQuery}
          items={searchItems}
          inputRef={searchInputRef}
        />
        {!searchQuery.trim() && (
          <>
            <SettingsMenu header="Your Account">
              <SettingsMenuItem
                searchId="profile"
                leftIcon="user"
                title={AppConfig.strings.settings.sections.profile}
                description="Your name, documents, and device settings"
                onPress={onProfile}
                testID="settings-profile"
              />
            </SettingsMenu>

            <SettingsMenu header="Workplaces">
              <SettingsMenuItem
                searchId="workplace"
                leftIcon={currentWorkplace?.icon ?? 'briefcase'}
                title={
                  currentWorkplace?.name ?? AppConfig.strings.settings.sections.currentWorkplace
                }
                description="Current workplace · Currency, Safe-to-Spend, and books"
                onPress={onCurrentWorkplace}
                testID="settings-current-workplace"
              />
            </SettingsMenu>

            <SettingsMenu header="Preferences">
              <SettingsMenuItem
                searchId="notifications"
                leftIcon="notifications"
                title={notificationTitle}
                description={notificationDescription}
                onPress={onAutomation}
                testID="settings-automation"
              />
              <SettingsMenuItem
                searchId="appearance"
                leftIcon="palette"
                title={AppConfig.strings.settings.sections.appearance}
                description="Theme, typography, time, and display options"
                onPress={onAppearance}
                testID="settings-appearance"
              />
              <SettingsMenuItem
                searchId="privacy-security"
                leftIcon="shieldCheck"
                title={AppConfig.strings.settings.sections.privacyAndSecurity}
                description="Hide balances, protect widgets, and lock the app"
                onPress={onPrivacy}
                testID="settings-privacy-security"
              />
            </SettingsMenu>

            <SettingsMenu header="Data">
              <SettingsMenuItem
                searchId="data-management"
                leftIcon="database"
                title={AppConfig.strings.settings.sections.dataManagement}
                description="Back up, restore, share, and review workplace data"
                onPress={onDataManagement}
                testID="settings-data-management"
              />
              <SettingsMenuItem
                searchId="maintenance"
                leftIcon="wrench"
                title={AppConfig.strings.settings.sections.maintenanceAndReset}
                description="Verify books, purge deleted records, or reset the app"
                onPress={onMaintenance}
                testID="settings-maintenance"
              />
            </SettingsMenu>

            <SettingsMenu header="Support">
              <SettingsMenuItem
                searchId="about-support"
                leftIcon="info"
                title={AppConfig.strings.settings.sections.aboutAndSupport}
                description="Community, ratings, source code, and version"
                onPress={onAbout}
                prominent
                testID="settings-about-support"
              />
            </SettingsMenu>
          </>
        )}
      </Stack>
    </SettingsLayout>
  );
}
