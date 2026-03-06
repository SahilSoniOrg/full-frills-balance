import { AppButton, AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { ArchetypePreference } from '@/src/features/settings/components/ArchetypePreference';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const router = useRouter();
    const { theme, fonts } = useTheme();
    const [localName, setLocalName] = useState(vm.userName);

    const {
        isPrivacyMode,
        onTogglePrivacy,
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats,
        isExporting,
        isImporting,
        isMaintenanceMode,
        integrityProgress,
        integrityProgressMessage,
        isCleaning,
        isResetting,
        onExport,
        onImport,
        onAuditLog,
        onFixIntegrity,
        onCleanup,
        onFactoryReset,
    } = vm;

    const handleNameSave = () => {
        if (localName.trim() !== vm.userName) {
            vm.setUserName(localName);
        }
    };

    return (
        <>
            <Screen
                showBack={false}
                scrollable
                withPadding
            >
                <View style={styles.inner}>
                    <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                        Personalization
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={styles.card}>
                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1 }}>
                                <AppInput
                                    label="Your Name"
                                    value={localName}
                                    onChangeText={setLocalName}
                                    onBlur={handleNameSave}
                                    onSubmitEditing={handleNameSave}
                                    placeholder="How should we call you?"
                                    leftIcon="user"
                                />
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <CurrencyPreference />

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1, marginRight: Spacing.md }}>
                                <AppText variant="body" weight="semibold">Theme & Typography</AppText>
                                <AppText variant="caption" color="secondary">
                                    Customize colors, fonts, and dark mode
                                </AppText>
                            </View>
                            <AppButton
                                variant="secondary"
                                size="sm"
                                onPress={() => router.push('/appearance-settings')}
                            >
                                Customize
                            </AppButton>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <ArchetypePreference />
                    </AppCard>

                    <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                        Preferences
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={styles.card}>
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
                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1, marginRight: Spacing.md }}>
                                <AppText variant="body" weight="semibold">SMS Auto-Post Rules</AppText>
                                <AppText variant="caption" color="secondary">Manage rules to automatically post imported SMS</AppText>
                            </View>
                            <AppButton
                                variant="secondary"
                                size="sm"
                                onPress={vm.onManageSmsRules}
                            >
                                Manage
                            </AppButton>
                        </View>
                    </AppCard>

                    <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                        Community & Support
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={styles.card}>
                        <View style={styles.rowBetween}>
                            <AppIcon name="messageCircle" size={24} color={theme.primary} style={{ marginRight: Spacing.md }} />
                            <View style={{ flex: 1, marginRight: Spacing.md }}>
                                <AppText variant="body" weight="semibold">Telegram Community</AppText>
                                <AppText variant="caption" color="secondary">
                                    Join our group for discussions and support
                                </AppText>
                            </View>
                            <AppButton
                                variant="secondary"
                                size="sm"
                                onPress={() => Linking.openURL('https://t.me/FullFrills')}
                            >
                                Join
                            </AppButton>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <View style={styles.rowBetween}>
                            <AppIcon name="playSquare" size={24} color={theme.primary} style={{ marginRight: Spacing.md }} />
                            <View style={{ flex: 1, marginRight: Spacing.md }}>
                                <AppText variant="body" weight="semibold">Rate on Play Store</AppText>
                                <AppText variant="caption" color="secondary">
                                    Love the app? Leave a review
                                </AppText>
                            </View>
                            <AppButton
                                variant="secondary"
                                size="sm"
                                onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance')}
                            >
                                Rate
                            </AppButton>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <View style={styles.rowBetween}>
                            <AppIcon name="github" size={24} color={theme.primary} style={{ marginRight: Spacing.md }} />
                            <View style={{ flex: 1, marginRight: Spacing.md }}>
                                <AppText variant="body" weight="semibold">GitHub Source</AppText>
                                <AppText variant="caption" color="secondary">
                                    Star the repo or contribute
                                </AppText>
                            </View>
                            <AppButton
                                variant="secondary"
                                size="sm"
                                onPress={() => Linking.openURL('https://github.com/SahilSoniOrg/full-frills-balance')}
                            >
                                View
                            </AppButton>
                        </View>
                    </AppCard>

                    <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                        {AppConfig.strings.settings.sections.dataManagement}
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={styles.card}>
                        <AppText variant="body" style={styles.cardDesc}>
                            {AppConfig.strings.settings.data.exportDesc}
                        </AppText>
                        <AppButton
                            variant="outline"
                            onPress={onExport}
                            loading={isExporting}
                        >
                            {AppConfig.strings.settings.data.exportBtn}
                        </AppButton>

                        <AppButton
                            variant="outline"
                            onPress={onImport}
                            loading={isImporting}
                            style={{ marginTop: Spacing.sm }}
                        >
                            {AppConfig.strings.settings.data.importBtn}
                        </AppButton>

                        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                        <AppText variant="body" style={styles.cardDesc}>
                            {AppConfig.strings.settings.data.auditDesc}
                        </AppText>
                        <AppButton
                            variant="outline"
                            onPress={onAuditLog}
                        >
                            {AppConfig.strings.settings.data.auditBtn}
                        </AppButton>
                    </AppCard>

                    <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                        {AppConfig.strings.settings.sections.maintenance}
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={styles.card}>
                        <AppText variant="body" style={styles.cardDesc}>
                            {AppConfig.strings.settings.maintenance.integrityDesc}
                        </AppText>
                        <AppButton
                            variant="secondary"
                            onPress={onFixIntegrity}
                            loading={isMaintenanceMode}
                        >
                            {AppConfig.strings.settings.maintenance.integrityBtn}
                        </AppButton>
                    </AppCard>

                    <AppText variant="subheading" style={[styles.sectionTitle, { color: theme.error, fontFamily: fonts.bold }]}
                    >
                        {AppConfig.strings.settings.sections.dangerZone}
                    </AppText>
                    <AppCard elevation="sm" padding="md" style={[styles.card, { borderColor: withOpacity(theme.error, Opacity.soft), borderWidth: 1 }]}
                    >
                        <AppText variant="body" style={styles.cardDesc}>
                            {AppConfig.strings.settings.danger.cleanupDesc}
                        </AppText>
                        <AppButton
                            variant="outline"
                            onPress={onCleanup}
                            style={{ borderColor: theme.error }}
                            loading={isCleaning}
                        >
                            {AppConfig.strings.settings.danger.cleanupBtn}
                        </AppButton>

                        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                        <AppText variant="body" style={styles.cardDesc}>
                            {AppConfig.strings.settings.danger.resetDesc}
                        </AppText>
                        <AppButton
                            variant="primary"
                            onPress={onFactoryReset}
                            style={{ backgroundColor: theme.error }}
                            loading={isResetting}
                        >
                            {AppConfig.strings.settings.danger.resetBtn}
                        </AppButton>
                    </AppCard>

                    <View style={styles.footer}>
                        <AppText variant="caption" color="secondary">
                            {AppConfig.strings.settings.version(Application.nativeApplicationVersion || AppConfig.appVersion)} ({Application.nativeBuildVersion || '1'})
                            {Constants.expoConfig?.extra?.gitCommit ? ` - ${Constants.expoConfig.extra.gitCommit}` : ''}
                        </AppText>
                    </View>
                </View>
            </Screen>

            {/* Blocking integrity check progress modal */}
            <Modal
                visible={isMaintenanceMode}
                transparent
                animationType="fade"
                statusBarTranslucent
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.modalIconRow}>
                            <AppText variant="heading" style={{ fontSize: 40 }}>🔍</AppText>
                        </View>

                        <AppText variant="subheading" style={styles.modalTitle}>
                            Running Integrity Check
                        </AppText>

                        <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceSecondary }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor: theme.primary,
                                        width: `${Math.max(2, Math.min(100, integrityProgress * 100))}%`,
                                    },
                                ]}
                            />
                        </View>

                        <AppText variant="body" color="secondary" style={styles.modalStatus}>
                            {integrityProgressMessage || 'Please wait...'}
                        </AppText>

                        <AppText variant="caption" color="secondary" style={styles.modalHint}>
                            Do not close the app while this is running.
                        </AppText>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    inner: {
        paddingVertical: Spacing.md,
    },
    sectionTitle: {
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
        // dynamic font
    },
    card: {
        marginBottom: Spacing.md,
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardDesc: {
        marginBottom: Spacing.md,
    },
    themeOptions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    themeButton: {
        flex: 1,
        marginHorizontal: Spacing.xs,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.lg,
    },
    footer: {
        marginTop: Spacing.xl,
        alignItems: 'center',
        paddingBottom: Spacing.xl,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    modalCard: {
        width: '100%',
        borderRadius: 16,
        padding: Spacing.xl,
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    modalIconRow: {
        marginBottom: Spacing.md,
    },
    modalTitle: {
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    progressBarBg: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: Spacing.md,
    },
    progressBarFill: {
        height: '100%',
    },
    modalStatus: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    modalHint: {
        textAlign: 'center',
        opacity: 0.6,
        marginTop: Spacing.md,
    },
});
