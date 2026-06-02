import { AppInput } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { ArchetypePreferenceView } from '@/src/features/settings/components/ArchetypePreferenceView';
import { CurrencyPreferenceView } from '@/src/features/settings/components/CurrencyPreferenceView';
import { SafeToSpendPreferenceView } from '@/src/features/settings/components/SafeToSpendPreferenceView';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import type { PersonalizationViewModel } from '@/src/features/settings/hooks/usePersonalizationViewModel';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { useState } from 'react';
import { View } from 'react-native';

interface PersonalizationSettingsViewProps {
  vm: PersonalizationViewModel;
}

export function PersonalizationSettingsView({ vm }: PersonalizationSettingsViewProps) {
  const { isAccountEnabled } = useFeatureFlags();
  const [localName, setLocalName] = useState(vm.userName);

  const handleNameSave = () => {
    if (localName.trim() !== vm.userName) {
      vm.setUserName(localName);
    }
  };

  return (
    <SettingsLayout title={AppConfig.strings.settings.sections.personalization}>
      <Stack space="xl">
        <SettingsMenu header="Personalization">
          {!isAccountEnabled && (
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
          )}
          <ArchetypePreferenceView
            currentArchetypeId={vm.archetype}
            onSelect={vm.onUpdateArchetype}
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.moneyDefaults}>
          <CurrencyPreferenceView
            selectedCurrency={vm.workplaceCurrency}
            currencies={vm.currencies}
            workplaceName={vm.workplaceName}
            onSelect={vm.onUpdateCurrency}
          />
        </SettingsMenu>

        <SettingsMenu header={AppConfig.strings.settings.sections.forecasting}>
          <SafeToSpendPreferenceView days={vm.safeToSpendDays} onChange={vm.setSafeToSpendDays} />
        </SettingsMenu>
      </Stack>
    </SettingsLayout>
  );
}
