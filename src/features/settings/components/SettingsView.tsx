import { AppButton, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { NotificationPreference } from '@/src/features/settings/components/NotificationPreference';
import { SettingsActionRow } from '@/src/features/settings/components/SettingsActionRow';
import { SettingsSection } from '@/src/features/settings/components/SettingsSection';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React from 'react';
import { Linking, Platform } from 'react-native';
import { Box, Inline, Inset, Page, Stack, Separator } from '@/src/design-system';

export function SettingsView(vm: SettingsViewModel) {

    const {
        isPrivacyMode,
        onTogglePrivacy,
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats,
    } = vm;

    return (
        <Page scrollable>
            <Inset space="md" vertical="md">
                <Stack space="xl">
                    <SettingsSection title="Profile & Preferences">
                        <SettingsActionRow
                            icon="user"
                            title={AppConfig.strings.settings.sections.personalization}
                            description="Name, Default Currency, and Archetype"
                            actionLabel="Manage"
                            onPress={vm.onPersonalizationSettings}
                        />
                    </SettingsSection>

                    <NotificationPreference />

                    <SettingsSection title="Appearance">
                        <SettingsActionRow
                            icon="sparkles"
                            title="Appearance"
                            description={AppConfig.strings.settings.personalization.themeTypographyDesc}
                            actionLabel="Customize"
                            onPress={vm.onAppearanceSettings}
                        />
                    </SettingsSection>

                    {Platform.OS === 'android' && (
                        <SettingsSection title="Automation">
                            <SettingsActionRow
                                icon="messageCircle"
                                title="SMS Inbox"
                                description="Review pending, processed, duplicate, and failed SMS imports"
                                actionLabel="Open"
                                onPress={vm.onSmsInbox}
                                withSeparator
                            />
                            <SettingsActionRow
                                icon="messageCircle"
                                title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                                description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                                actionLabel="Rules"
                                onPress={vm.onManageSmsRules}
                            />
                        </SettingsSection>
                    )}

                    <SettingsSection title="Privacy">
                        <Stack space="md">
                            <Inline align="center" justify="space-between" space="md">
                                <Stack space="xs" flex={1}>
                                    <AppText variant="body" weight="semibold">{AppConfig.strings.settings.privacy.title}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.privacy.description}</AppText>
                                </Stack>
                                <AppButton
                                    variant={isPrivacyMode ? 'primary' : 'outline'}
                                    size="sm"
                                    onPress={onTogglePrivacy}
                                >
                                    {isPrivacyMode ? AppConfig.strings.settings.privacy.on : AppConfig.strings.settings.privacy.off}
                                </AppButton>
                            </Inline>
                            <Separator />
                            <Inline align="center" justify="space-between" space="md">
                                <Stack space="xs" flex={1}>
                                    <AppText variant="body" weight="semibold">App Lock</AppText>
                                    <AppText variant="caption" color="secondary">Require biometric or passcode authentication to open the app</AppText>
                                </Stack>
                                <AppButton
                                    variant={vm.isAppLockEnabled ? 'primary' : 'outline'}
                                    size="sm"
                                    onPress={vm.onToggleAppLock}
                                >
                                    {vm.isAppLockEnabled ? AppConfig.strings.settings.privacy.on : AppConfig.strings.settings.privacy.off}
                                </AppButton>
                            </Inline>
                            <Separator />
                            <Inline align="center" justify="space-between" space="md">
                                <Stack space="xs" flex={1}>
                                    <AppText variant="body" weight="semibold">{AppConfig.strings.settings.stats.title}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.stats.description}</AppText>
                                </Stack>
                                <AppButton
                                    variant={showAccountMonthlyStats ? 'primary' : 'outline'}
                                    size="sm"
                                    onPress={onToggleAccountMonthlyStats}
                                >
                                    {showAccountMonthlyStats ? AppConfig.strings.settings.privacy.on : AppConfig.strings.settings.privacy.off}
                                </AppButton>
                            </Inline>
                        </Stack>
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
                            withSeparator
                        />
                        <SettingsActionRow
                            icon="playSquare"
                            title={AppConfig.strings.settings.community.playStoreTitle}
                            description={AppConfig.strings.settings.community.playStoreDesc}
                            actionLabel="Rate"
                            onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance')}
                            withSeparator
                        />
                        <SettingsActionRow
                            icon="github"
                            title={AppConfig.strings.settings.community.githubTitle}
                            description={AppConfig.strings.settings.community.githubDesc}
                            actionLabel="View"
                            onPress={() => Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance')}
                        />
                    </SettingsSection>

                    <Box alignItems="center" marginTop="xl" paddingBottom="xl">
                        <AppText variant="caption" color="secondary">
                            {AppConfig.strings.settings.version(Application.nativeApplicationVersion || AppConfig.appVersion)} ({Application.nativeBuildVersion || '1'})
                            {Constants.expoConfig?.extra?.gitCommit ? ` - ${Constants.expoConfig.extra.gitCommit}` : ''}
                        </AppText>
                    </Box>
                </Stack>
            </Inset>
        </Page>
    );
}

