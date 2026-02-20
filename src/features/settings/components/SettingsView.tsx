import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const router = useRouter();
    const { theme, fonts } = useTheme();
    const {
        isPrivacyMode,
        onTogglePrivacy,
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats,
        isExporting,
        isImporting,
        isMaintenanceMode,
        isCleaning,
        isResetting,
        onExport,
        onImport,
        onAuditLog,
        onFixIntegrity,
        onCleanup,
        onFactoryReset,
    } = vm;

    return (
        <Screen
            showBack={false}
            scrollable
            withPadding
        >
            <View style={styles.inner}>
                <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                    {AppConfig.strings.settings.sections.general}
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <CurrencyPreference />
                </AppCard>

                <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                    {AppConfig.strings.settings.sections.appearance}
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
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
                </AppCard>

                <AppText variant="subheading" style={[styles.sectionTitle, { fontFamily: fonts.bold }]}>
                    Preferences
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
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
                        <View style={{ flex: 1 }}>
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
                        {AppConfig.strings.settings.version(AppConfig.appVersion)}
                    </AppText>
                </View>
            </View>
        </Screen >
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
});
