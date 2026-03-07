import { AppInput } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { ArchetypePreference } from '@/src/features/settings/components/ArchetypePreference';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsSection } from '@/src/features/settings/components/SettingsSection';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
            withPadding
        >
            <View style={styles.container}>
                <SettingsSection title={AppConfig.strings.settings.personalization.yourName}>
                    <AppInput
                        label={AppConfig.strings.settings.personalization.yourName}
                        value={localName}
                        onChangeText={setLocalName}
                        onBlur={handleNameSave}
                        onSubmitEditing={handleNameSave}
                        placeholder={AppConfig.strings.settings.personalization.yourNamePlaceholder}
                        leftIcon="user"
                    />
                </SettingsSection>

                <SettingsSection title={AppConfig.strings.settings.currency.title}>
                    <CurrencyPreference />
                </SettingsSection>

                <SettingsSection title="Style & Strategy">
                    <ArchetypePreference />
                </SettingsSection>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: Spacing.xl,
    },
});
