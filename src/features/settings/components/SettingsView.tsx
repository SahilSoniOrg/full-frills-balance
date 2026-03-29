import { AppIcon, AppText, AppToggle } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { NotificationPreference } from '@/src/features/settings/components/NotificationPreference';
import { SettingsMenu } from '@/src/features/settings/components/SettingsMenu';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React from 'react';
import { Linking, Platform } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const { theme } = useTheme();
    const {
        isPrivacyMode,
        onTogglePrivacy,
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats,
        isAppLockEnabled,
        onToggleAppLock,
    } = vm;

    return (
        <Screen title="Settings" showBack={false} alignTitle="left" scrollable>
            <Inset space="md" vertical="md">
                <Stack space="xl">
                    {/* Profile & Preferences */}
                    <SettingsMenu header="Profile & Preferences">
                        <SettingsMenuItem
                            leftIcon="user"
                            title={AppConfig.strings.settings.sections.personalization}
                            description="Name and Default Currency"
                            onPress={vm.onPersonalizationSettings}
                        />
                        <SettingsMenuItem
                            leftIcon="palette"
                            title="Appearance"
                            description={AppConfig.strings.settings.personalization.themeTypographyDesc}
                            onPress={vm.onAppearanceSettings}
                        />
                    </SettingsMenu>

                    {/* Notifications */}
                    <SettingsMenu header="Notifications" hideSeprator>
                        <SettingsMenuItem
                            leftIcon="notifications"
                            title={AppConfig.strings.settings.notifications.title}
                            description={AppConfig.strings.settings.notifications.description}
                            hasArrow={false}
                        />
                        <NotificationPreference />
                    </SettingsMenu>

                    {/* Automation */}
                    {Platform.OS === 'android' && (
                        <SettingsMenu header="Automation">
                            <SettingsMenuItem
                                leftIcon="messageSquare"
                                title="SMS Inbox"
                                description="Review pending, processed, duplicate, and failed SMS imports"
                                onPress={vm.onSmsInbox}
                            />
                            <SettingsMenuItem
                                leftIcon="messageSquare"
                                title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                                description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                                onPress={vm.onManageSmsRules}
                            />
                        </SettingsMenu>
                    )}

                    {/* Privacy */}
                    <SettingsMenu header="Privacy">
                        <SettingsMenuItem
                            leftIcon="shield"
                            title={AppConfig.strings.settings.privacy.title}
                            description={AppConfig.strings.settings.privacy.description}
                            hasArrow={false}
                            rightContent={
                                <AppToggle
                                    value={isPrivacyMode}
                                    onValueChange={onTogglePrivacy}
                                />
                            }
                        />
                        <SettingsMenuItem
                            leftIcon="lock"
                            title="App Lock"
                            description="Require biometric or passcode authentication to open the app"
                            hasArrow={false}
                            rightContent={
                                <AppToggle
                                    value={isAppLockEnabled}
                                    onValueChange={onToggleAppLock}
                                />
                            }
                        />
                        <SettingsMenuItem
                            leftIcon="barChart"
                            title={AppConfig.strings.settings.stats.title}
                            description={AppConfig.strings.settings.stats.description}
                            hasArrow={false}
                            rightContent={
                                <AppToggle
                                    value={showAccountMonthlyStats}
                                    onValueChange={onToggleAccountMonthlyStats}
                                />
                            }
                        />
                        <SettingsMenuItem
                            leftIcon="eyeOff"
                            title={AppConfig.strings.settings.privacy.widgetPrivacyTitle}
                            description={AppConfig.strings.settings.privacy.widgetPrivacyDesc}
                            hasArrow={false}
                            rightContent={
                                <AppToggle
                                    value={vm.isWidgetPrivacyEnabled}
                                    onValueChange={vm.onToggleWidgetPrivacy}
                                />
                            }
                        />
                    </SettingsMenu>

                    {/* Community & Support */}
                    <SettingsMenu header={AppConfig.strings.settings.sections.communitySupport}>
                        <SettingsMenuItem
                            leftIcon="messageCircle"
                            iconColor
                            title={AppConfig.strings.settings.community.telegramTitle}
                            description={AppConfig.strings.settings.community.telegramDesc}
                            onPress={() => Linking.openURL('https://t.me/FullFrills')}
                        />
                        <SettingsMenuItem
                            leftIcon="star"
                            iconColor
                            title={AppConfig.strings.settings.community.playStoreTitle}
                            description={AppConfig.strings.settings.community.playStoreDesc}
                            onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance')}
                        />
                        <SettingsMenuItem
                            leftIcon="github"
                            iconColor
                            title={AppConfig.strings.settings.community.githubTitle}
                            description={AppConfig.strings.settings.community.githubDesc}
                            onPress={() => Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance')}
                        />
                    </SettingsMenu>

                    {/* Data Management */}
                    <SettingsMenu header="Data Management">
                        <SettingsMenuItem
                            leftIcon="database"
                            title="Data & Maintenance"
                            description="Export, Import, Audit Log, and Repairs"
                            onPress={vm.onDataManagementSettings}
                        />
                    </SettingsMenu>

                    {/* Footer Info */}
                    <Box alignItems="center" marginTop="xl" paddingBottom="xl">
                        <AppText variant="caption" color="secondary" align="center">
                            {AppConfig.strings.settings.version(Application.nativeApplicationVersion || AppConfig.appVersion)} ({Application.nativeBuildVersion || '1'})
                            {Constants.expoConfig?.extra?.gitCommit ? ` - ${Constants.expoConfig.extra.gitCommit}` : ''}
                        </AppText>
                        <AppText variant="caption" color="secondary" align="center" style={{ marginTop: Spacing.xs }}>
                            <Inline space="xs" align="center" justify="center">
                                <AppText variant="caption" color="secondary">Made with</AppText>
                                <AppIcon name="heart" size={12} color={theme.error} />
                                <AppText variant="caption" color="secondary">for financial freedom</AppText>
                            </Inline>
                        </AppText>
                    </Box>
                </Stack>
            </Inset>
        </Screen>
    );
}
