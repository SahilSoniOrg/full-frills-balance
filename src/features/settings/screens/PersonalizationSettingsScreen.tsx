import { AppInput } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { Inset, Stack } from '@/src/design-system';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SafeToSpendPreference } from '@/src/features/settings/components/SafeToSpendPreference';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React, { useState } from 'react';
import { View } from 'react-native';

export default function PersonalizationSettingsScreen() {
  const vm = useSettingsViewModel();
  const [localName, setLocalName] = useState(vm.userName);

  const handleNameSave = () => {
    if (localName.trim() !== vm.userName) {
      vm.setUserName(localName);
    }
  };

  return (
    <Screen title={AppConfig.strings.settings.sections.personalization} showBack={true} scrollable>
      <Inset space="md" vertical="md">
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

          <SettingsMenu header={AppConfig.strings.settings.sections.moneyDefaults}>
            <CurrencyPreference />
          </SettingsMenu>

          <SettingsMenu header={AppConfig.strings.settings.sections.forecasting}>
            <SafeToSpendPreference />
          </SettingsMenu>
        </Stack>
      </Inset>
    </Screen>
  );
}
