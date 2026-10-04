import { Icon } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { WorkplaceSwitcher } from '@/src/components/workplace/WorkplaceSwitcher';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { Platform, TextInput } from 'react-native';
import { SettingsSearchResults } from '@/src/features/settings/components/SettingsSearchResults';
import { createSettingsSearchCatalog } from '@/src/features/settings/components/settingsSearchCatalog';
import { AppNavigation } from '@/src/utils/navigation';
import { useMemo, useRef, useState } from 'react';

export interface SettingsViewProps {
  onProfile: () => void;
  onAppearance: () => void;
  onAutomation: () => void;
  onSmsSettings: (focus?: string) => void;
  onSmsInbox: () => void;
  onSmsRules: () => void;
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
  onSmsSettings,
  onSmsInbox,
  onSmsRules,
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
        onSmsSettings,
        onSmsInbox,
        onSmsRules,
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
      onSmsSettings,
      onSmsInbox,
      onSmsRules,
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
      <Stack space="md">
        <SettingsSearchResults
          query={searchQuery}
          onQueryChange={setSearchQuery}
          items={searchItems}
          inputRef={searchInputRef}
        />
        {!searchQuery.trim() && (
          <>
            <SettingsMenuSection header="Your Account">
              <SettingsSearchMenuItem
                searchId="profile"
                leftIcon={Icon.User}
                title={AppConfig.strings.settings.sections.profile}
                description="Your name, documents, and device settings"
                onPress={onProfile}
                testID="settings-profile"
              />
            </SettingsMenuSection>

            <SettingsMenuSection header="Workplaces">
              <SettingsSearchMenuItem
                searchId="workplace"
                leftIcon={currentWorkplace?.icon ?? Icon.Briefcase}
                title={
                  currentWorkplace?.name ?? AppConfig.strings.settings.sections.currentWorkplace
                }
                description="Current workplace · Currency, Safe-to-Spend, and books"
                onPress={onCurrentWorkplace}
                testID="settings-current-workplace"
              />
            </SettingsMenuSection>

            <SettingsMenuSection header="Preferences">
              <SettingsSearchMenuItem
                searchId="notifications"
                leftIcon={Icon.Notifications}
                title={notificationTitle}
                description={notificationDescription}
                onPress={onAutomation}
                testID="settings-automation"
              />
              <SettingsSearchMenuItem
                searchId="appearance"
                leftIcon={Icon.Palette}
                title={AppConfig.strings.settings.sections.appearance}
                onPress={onAppearance}
                testID="settings-appearance"
              />
              <SettingsSearchMenuItem
                searchId="privacy-security"
                leftIcon={Icon.ShieldCheck}
                title={AppConfig.strings.settings.sections.privacyAndSecurity}
                description="Hide balances, protect widgets, and lock the app"
                onPress={onPrivacy}
                testID="settings-privacy-security"
              />
            </SettingsMenuSection>

            <SettingsMenuSection header="Data">
              <SettingsSearchMenuItem
                searchId="data-management"
                leftIcon={Icon.Database}
                title={AppConfig.strings.settings.sections.dataManagement}
                description="Back up, restore, share, and review workplace data"
                onPress={onDataManagement}
                testID="settings-data-management"
              />
              <SettingsSearchMenuItem
                searchId="maintenance"
                leftIcon={Icon.Wrench}
                title={AppConfig.strings.settings.sections.maintenanceAndReset}
                description="Verify books, purge deleted records, or reset the app"
                onPress={onMaintenance}
                testID="settings-maintenance"
              />
            </SettingsMenuSection>

            <SettingsMenuSection header="Support">
              <SettingsSearchMenuItem
                searchId="about-support"
                leftIcon={Icon.Info}
                title={AppConfig.strings.settings.sections.aboutAndSupport}
                description="Community, ratings, source code, and version"
                onPress={onAbout}
                prominent
                testID="settings-about-support"
              />
            </SettingsMenuSection>
          </>
        )}
      </Stack>
    </SettingsLayout>
  );
}

export default function SettingsScreen() {
  return (
    <SettingsView
      onProfile={AppNavigation.toPersonalizationSettings}
      onAppearance={AppNavigation.toAppearanceSettings}
      onAutomation={AppNavigation.toAutomationSettings}
      onSmsSettings={AppNavigation.toSmsSettings}
      onSmsInbox={AppNavigation.toTransactionInbox}
      onSmsRules={AppNavigation.toSmsRules}
      onPrivacy={AppNavigation.toPrivacySecuritySettings}
      onPrivacyNotice={AppNavigation.toPrivacyNotice}
      onCurrentWorkplace={AppNavigation.toCurrentWorkplaceSettings}
      onDataManagement={AppNavigation.toDataManagementSettings}
      onMaintenance={AppNavigation.toMaintenanceSettings}
      onAbout={AppNavigation.toAboutSupportSettings}
      onDeviceSettings={AppNavigation.toDeviceSettings}
    />
  );
}
