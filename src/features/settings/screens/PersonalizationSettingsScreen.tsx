import { AppInput } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { ArchetypePreference } from '@/src/features/settings/components/ArchetypePreference';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Inset } from '@/src/design-system';

export default function PersonalizationSettingsScreen() {
    const vm = useSettingsViewModel();
    const [localName, setLocalName] = useState(vm.userName);

    const handleNameSave = () => {
        if (localName.trim() !== vm.userName) {
            vm.setUserName(localName);
        }
    };

    return (
        <Screen
            title={AppConfig.strings.settings.sections.personalization}
            showBack={true}
            scrollable
        >
            <Inset space="md" vertical="md">
                <SettingsMenu header={AppConfig.strings.settings.sections.personalization}>
                    <SettingsMenuItem
                        title={AppConfig.strings.settings.personalization.yourName}
                        description="Used for personalized greetings"
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
                    <CurrencyPreference />
                    <ArchetypePreference />
                </SettingsMenu>
            </Inset>
        </Screen>
    );
}
