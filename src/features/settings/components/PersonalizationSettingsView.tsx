import { Icon, AppInput } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenuSection as SettingsMenu } from '@/src/features/settings/components/SettingsMenuSection';
import { SettingsSearchMenuItem as SettingsMenuItem } from '@/src/features/settings/components/SettingsSearchMenuItem';
import {
  usePersonalizationViewModel,
  type PersonalizationViewModel,
} from '@/src/features/settings/hooks/usePersonalizationViewModel';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { AppNavigation } from '@/src/utils/navigation';
import { View } from 'react-native';

interface PersonalizationSettingsViewProps {
  vm: PersonalizationViewModel;
}

export function PersonalizationSettingsView({ vm }: PersonalizationSettingsViewProps) {
  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.profile}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.sections.profile}>
          <SettingsMenuItem
            searchId="profile-name"
            leftIcon={Icon.User}
            title={AppConfig.strings.settings.personalization.yourName}
            description={AppConfig.strings.settings.personalization.yourNameDesc}
            hasArrow={false}
            rightContent={
              <View style={{ width: 140 }}>
                <AppInput
                  value={vm.draftName}
                  onChangeText={vm.setDraftName}
                  onBlur={vm.commitName}
                  onSubmitEditing={vm.commitName}
                  placeholder={AppConfig.strings.settings.personalization.yourName}
                  variant="minimal"
                  textAlign="right"
                />
              </View>
            }
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.documents}>
          <SettingsMenuItem
            searchId="privacy-notice"
            leftIcon={Icon.Document}
            title={PRIVACY_NOTICE_STRINGS.title}
            description={PRIVACY_NOTICE_STRINGS.subtitle}
            onPress={vm.onOpenPrivacyNotice}
            testID="settings-privacy-notice"
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.devicesAndSessions}>
          <SettingsMenuItem
            searchId="devices"
            leftIcon={Icon.Settings}
            title={AppConfig.strings.settings.sections.devicesAndSessions}
            description={AppConfig.strings.settings.hub.devicesDescription}
            onPress={AppNavigation.toDeviceSettings}
            prominent
            testID="profile-devices-sessions"
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}

export default function PersonalizationSettingsScreen() {
  const vm = usePersonalizationViewModel();
  return <PersonalizationSettingsView vm={vm} />;
}
