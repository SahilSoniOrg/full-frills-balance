import { ListGroup, ListRow, Icon, AppInput } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
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
        <ListGroup variant="plain" header={AppConfig.strings.settings.sections.profile}>
          <ListRow
            focusId="profile-name"
            icon={Icon.User}
            title={AppConfig.strings.settings.personalization.yourName}
            subtitle={AppConfig.strings.settings.personalization.yourNameDesc}
            trailing={
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
        </ListGroup>

        <ListGroup variant="plain" header={AppConfig.strings.settings.sections.documents}>
          <ListRow
            focusId="privacy-notice"
            icon={Icon.Document}
            title={PRIVACY_NOTICE_STRINGS.title}
            subtitle={PRIVACY_NOTICE_STRINGS.subtitle}
            onPress={vm.onOpenPrivacyNotice}
            testID="settings-privacy-notice"
          />
        </ListGroup>

        <ListGroup variant="plain" header={AppConfig.strings.settings.sections.devicesAndSessions}>
          <ListRow
            focusId="devices"
            icon={Icon.Settings}
            title={AppConfig.strings.settings.sections.devicesAndSessions}
            subtitle={AppConfig.strings.settings.hub.devicesDescription}
            onPress={AppNavigation.toDeviceSettings}
            testID="profile-devices-sessions"
          />
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}

export default function PersonalizationSettingsScreen() {
  const vm = usePersonalizationViewModel();
  return <PersonalizationSettingsView vm={vm} />;
}
