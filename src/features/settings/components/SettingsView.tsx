import { AppButton, AppInput, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { ArchetypePreference } from '@/src/features/settings/components/ArchetypePreference';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsActionRow } from '@/src/features/settings/components/SettingsActionRow';
import { SettingsSection } from '@/src/features/settings/components/SettingsSection';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const { theme } = useTheme();
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
                    <SettingsSection title={AppConfig.strings.settings.sections.personalization}>
                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1 }}>
                                <AppInput
                                    label={AppConfig.strings.settings.personalization.yourName}
                                    value={localName}
                                    onChangeText={setLocalName}
                                    onBlur={handleNameSave}
                                    onSubmitEditing={handleNameSave}
                                    placeholder={AppConfig.strings.settings.personalization.yourNamePlaceholder}
                                    leftIcon="user"
                                />
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <CurrencyPreference />

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <SettingsActionRow
                            title={AppConfig.strings.settings.personalization.themeTypographyTitle}
                            description={AppConfig.strings.settings.personalization.themeTypographyDesc}
                            actionLabel="Customize"
                            onPress={vm.onAppearanceSettings}
                        />

                        <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                        <ArchetypePreference />
                    </SettingsSection>

                    <SettingsSection title={AppConfig.strings.settings.sections.preferences}>
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

                        <SettingsActionRow
                            title={AppConfig.strings.settings.personalization.smsAutoPostTitle}
                            description={AppConfig.strings.settings.personalization.smsAutoPostDesc}
                            actionLabel="Manage"
                            onPress={vm.onManageSmsRules}
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

                    <SettingsSection title={AppConfig.strings.settings.sections.dataManagement}>
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
                    </SettingsSection>

                    <SettingsSection title={AppConfig.strings.settings.sections.maintenance}>
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
                    </SettingsSection>

                    <SettingsSection
                        title={AppConfig.strings.settings.sections.dangerZone}
                        danger
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
                    </SettingsSection>

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
                            {AppConfig.strings.settings.maintenance.integrityTitle}
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
                            {integrityProgressMessage || AppConfig.strings.settings.maintenance.integrityWait}
                        </AppText>

                        <AppText variant="caption" color="secondary" style={styles.modalHint}>
                            {AppConfig.strings.settings.maintenance.integrityHint}
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
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardDesc: {
        marginBottom: Spacing.md,
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
