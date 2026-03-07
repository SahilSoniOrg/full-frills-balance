import { AppButton, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { SettingsActionRow } from '@/src/features/settings/components/SettingsActionRow';
import { SettingsSection } from '@/src/features/settings/components/SettingsSection';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const { theme } = useTheme();

    const {
        isPrivacyMode,
        onTogglePrivacy,
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats,
    } = vm;

    return (
        <Screen
            showBack={false}
            scrollable
            withPadding
        >
            <View style={styles.inner}>
                <SettingsSection title="Profile & Preferences">
                    <SettingsActionRow
                        icon="user"
                        title={AppConfig.strings.settings.sections.personalization}
                        description="Name, Default Currency, and Archetype"
                        actionLabel="Manage"
                        onPress={vm.onPersonalizationSettings}
                        withDivider
                    />
                    <SettingsActionRow
                        icon="sparkles"
                        title="Appearance"
                        description={AppConfig.strings.settings.personalization.themeTypographyDesc}
                        actionLabel="Customize"
                        onPress={vm.onAppearanceSettings}
                    />
                </SettingsSection>

                <SettingsSection title="Automation">
                    <SettingsActionRow
                        icon="messageCircle"
                        title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                        description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                        actionLabel="Rules"
                        onPress={vm.onManageSmsRules}
                    />
                </SettingsSection>

                <SettingsSection title="Privacy">
                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1, marginRight: Spacing.md }}>
                            <AppText variant="body" weight="semibold">{AppConfig.strings.settings.privacy.title}</AppText>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.settings.privacy.description}</AppText>
                        </View>
                        <AppButton
                            variant={isPrivacyMode ? 'primary' : 'outline'}
                            size="sm"
                            onPress={onTogglePrivacy}
                        >
                            {isPrivacyMode ? AppConfig.strings.settings.privacy.on : AppConfig.strings.settings.privacy.off}
                        </AppButton>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />
                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1, marginRight: Spacing.md }}>
                            <AppText variant="body" weight="semibold">{AppConfig.strings.settings.stats.title}</AppText>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.settings.stats.description}</AppText>
                        </View>
                        <AppButton
                            variant={showAccountMonthlyStats ? 'primary' : 'outline'}
                            size="sm"
                            onPress={onToggleAccountMonthlyStats}
                        >
                            {showAccountMonthlyStats ? AppConfig.strings.settings.privacy.on : AppConfig.strings.settings.privacy.off}
                        </AppButton>
                    </View>
                </SettingsSection>

                <SettingsSection title="System">
                    <SettingsActionRow
                        icon="history"
                        title="Data & Maintenance"
                        description="Export, Import, Audit Log, and Repairs"
                        actionLabel="Open"
                        onPress={vm.onDataManagementSettings}
                    />
                </SettingsSection>

                <SettingsSection title={AppConfig.strings.settings.sections.communitySupport}>
                    <SettingsActionRow
                        icon="messageCircle"
                        title={AppConfig.strings.settings.community.telegramTitle}
                        description={AppConfig.strings.settings.community.telegramDesc}
                        actionLabel="Join"
                        onPress={() => Linking.openURL('https://t.me/FullFrills')}
                        withDivider
                    />
                    <SettingsActionRow
                        icon="playSquare"
                        title={AppConfig.strings.settings.community.playStoreTitle}
                        description={AppConfig.strings.settings.community.playStoreDesc}
                        actionLabel="Rate"
                        onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance')}
                        withDivider
                    />
                    <SettingsActionRow
                        icon="github"
                        title={AppConfig.strings.settings.community.githubTitle}
                        description={AppConfig.strings.settings.community.githubDesc}
                        actionLabel="View"
                        onPress={() => Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance')}
                    />
                </SettingsSection>

                <View style={styles.footer}>
                    <AppText variant="caption" color="secondary">
                        {AppConfig.strings.settings.version(Application.nativeApplicationVersion || AppConfig.appVersion)} ({Application.nativeBuildVersion || '1'})
                        {Constants.expoConfig?.extra?.gitCommit ? ` - ${Constants.expoConfig.extra.gitCommit}` : ''}
                    </AppText>
                </View>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    inner: {
        paddingVertical: Spacing.md,
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    divider: {
        height: 1,
    },
    footer: {
        marginTop: Spacing.xl,
        alignItems: 'center',
        paddingBottom: Spacing.xl,
    },
});
