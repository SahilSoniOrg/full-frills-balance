import { AppInput } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { PersonalizationViewModel } from '@/src/features/settings/hooks/usePersonalizationViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { useState } from 'react';
import { View } from 'react-native';

interface PersonalizationSettingsViewProps {
  vm: PersonalizationViewModel;
}

export function PersonalizationSettingsView({ vm }: PersonalizationSettingsViewProps) {
  const [localName, setLocalName] = useState(vm.userName);

  const handleNameSave = () => {
    if (localName.trim() !== vm.userName) {
      vm.setUserName(localName);
    }
  };

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.profile}>
      <Stack space="xl">
        <SettingsMenu header={AppConfig.strings.settings.sections.profile}>
          <SettingsMenuItem
            title={AppConfig.strings.settings.personalization.yourName}
            description={AppConfig.strings.settings.personalization.yourNameDesc}
            hasArrow={false}
            rightContent={
              <View style={{ width: 140 }}>
                <AppInput
                  value={localName}
                  onChangeText={setLocalName}
                  onBlur={handleNameSave}
                  onSubmitEditing={handleNameSave}
                  placeholder="Your Name"
                  variant="minimal"
                  textAlign="right"
                />
              </View>
            }
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.devicesAndSessions}>
          <SettingsMenuItem
            leftIcon="settings"
            title={AppConfig.strings.settings.sections.devicesAndSessions}
            description="This device, local preferences, and future sessions"
            onPress={AppNavigation.toDeviceSettings}
            prominent
            testID="profile-devices-sessions"
          />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
