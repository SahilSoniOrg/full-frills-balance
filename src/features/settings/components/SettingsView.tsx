import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { ListGroup } from '@/src/components/core';
import { TextInput } from 'react-native';
import { SettingsSearchResults } from '@/src/features/settings/components/SettingsSearchResults';
import {
  createSettingsSearchCatalog,
  SETTINGS_HUB_SECTIONS,
  type SettingsActions,
  type SettingsSearchCapabilities,
} from '@/src/features/settings/components/settingsSections';
import {
  isGmailCaptureAccountHelpVisible,
  isGmailCaptureConnectedControlsVisible,
  isGmailCaptureSectionVisible,
} from '@/src/features/settings/utils/gmailCaptureVisibility';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { usePostHogFeatureFlag } from '@/src/hooks/usePostHogFeatureFlag';
import { POSTHOG_FEATURE_FLAGS } from '@/src/services/analytics/featureFlags';
import { gmailBinding } from '@/src/services/email/gmailConnection';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useIsFocused } from 'expo-router';
import { useMemo, useRef, useState } from 'react';

export function SettingsView({ actions }: { actions: SettingsActions }) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const isFocused = useIsFocused();
  const workplaceId = useOptionalWorkplace()?.workplaceId;
  const gmailFeatureEnabled = usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.gmailCaptureSettings);
  // Re-read when this screen is focused again (e.g. after connecting Gmail).
  const gmailConnected = useMemo(
    () => !!workplaceId && !!gmailBinding(workplaceId),
    [isFocused, workplaceId],
  );

  const searchCapabilities = useMemo<SettingsSearchCapabilities>(
    () => ({
      gmailCapture: isGmailCaptureSectionVisible(gmailFeatureEnabled, gmailConnected),
      gmailCaptureConnected: isGmailCaptureConnectedControlsVisible(
        gmailFeatureEnabled,
        gmailConnected,
      ),
      gmailCaptureAccountHelp: isGmailCaptureAccountHelpVisible(
        gmailFeatureEnabled,
        gmailConnected,
      ),
    }),
    [gmailConnected, gmailFeatureEnabled],
  );
  const searchItems = useMemo(
    () => createSettingsSearchCatalog(actions, searchCapabilities),
    [actions, searchCapabilities],
  );

  return (
    <SettingsLayout
      title={AppConfig.strings.settings.title}
      scrollViewProps={{ onScrollBeginDrag: () => searchInputRef.current?.blur() }}
    >
      <Stack gap="md">
        <SettingsSearchResults
          query={searchQuery}
          onQueryChange={setSearchQuery}
          items={searchItems}
          inputRef={searchInputRef}
        />
        {!searchQuery.trim() &&
          SETTINGS_HUB_SECTIONS.map(section => (
            <ListGroup
              variant="plain"
              key={section.header}
              header={section.header}
              items={section.rows}
              toRow={({ id, icon, title, description, action, testID }) => {
                return {
                  id,
                  focusId: id,
                  icon,
                  title,
                  subtitle: description,
                  onPress: () => actions[action](),
                  testID,
                };
              }}
            />
          ))}
      </Stack>
    </SettingsLayout>
  );
}

const SETTINGS_SCREEN_ACTIONS: SettingsActions = {
  onProfile: AppNavigation.toPersonalizationSettings,
  onAppearance: AppNavigation.toAppearanceSettings,
  onCaptureWorkspace: AppNavigation.toCaptureWorkspace,
  onSpendingReminders: AppNavigation.toSpendingReminderSettings,
  onSmsSettings: AppNavigation.toSmsSettings,
  onSmsInbox: AppNavigation.toTransactionInbox,
  onPrivacy: AppNavigation.toPrivacySecuritySettings,
  onPrivacyNotice: AppNavigation.toPrivacyNotice,
  onCurrentWorkplace: AppNavigation.toWorkplaceManagement,
  onDataManagement: AppNavigation.toDataManagementSettings,
  onMaintenance: AppNavigation.toMaintenanceSettings,
  onAbout: AppNavigation.toAboutSupportSettings,
  onDeviceSettings: AppNavigation.toDeviceSettings,
};

export default function SettingsScreen() {
  return <SettingsView actions={SETTINGS_SCREEN_ACTIONS} />;
}
