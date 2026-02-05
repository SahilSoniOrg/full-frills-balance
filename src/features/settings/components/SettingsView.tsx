import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Spacing, Typography, withOpacity } from '@/src/constants';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { SettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function SettingsView(vm: SettingsViewModel) {
    const {
        theme,
        themePreference,
        setThemePreference,
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
                <AppText variant="subheading" style={styles.sectionTitle}>
                    General
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <CurrencyPreference />
                </AppCard>

                <AppText variant="subheading" style={styles.sectionTitle}>
                    Appearance
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <View style={styles.themeOptions}>
                        {(['system', 'light', 'dark'] as const).map((pref) => (
                            <AppButton
                                key={pref}
                                variant={themePreference === pref ? 'primary' : 'outline'}
                                size="sm"
                                onPress={() => setThemePreference(pref)}
                                style={styles.themeButton}
                            >
                                {pref.charAt(0).toUpperCase() + pref.slice(1)}
                            </AppButton>
                        ))}
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                            <AppText variant="body" weight="semibold">Privacy Mode</AppText>
                            <AppText variant="caption" color="secondary">Mask balances across the app</AppText>
                        </View>
                        <AppButton
                            variant={isPrivacyMode ? 'primary' : 'outline'}
                            size="sm"
                            onPress={onTogglePrivacy}
                        >
                            {isPrivacyMode ? 'On' : 'Off'}
                        </AppButton>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.md }]} />

                    <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                            <AppText variant="body" weight="semibold">Account Statistics</AppText>
                            <AppText variant="caption" color="secondary">Show monthly income/expense on cards</AppText>
                        </View>
                        <AppButton
                            variant={showAccountMonthlyStats ? 'primary' : 'outline'}
                            size="sm"
                            onPress={onToggleAccountMonthlyStats}
                        >
                            {showAccountMonthlyStats ? 'On' : 'Off'}
                        </AppButton>
                    </View>
                </AppCard>

                <AppText variant="subheading" style={styles.sectionTitle}>
                    Data Management
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Export your data as a JSON file for backup or external use.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onExport}
                        loading={isExporting}
                    >
                        Export to JSON
                    </AppButton>

                    <AppButton
                        variant="outline"
                        onPress={onImport}
                        loading={isImporting}
                        style={{ marginTop: Spacing.sm }}
                    >
                        Import from JSON
                    </AppButton>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="body" style={styles.cardDesc}>
                        View all changes made to your data for auditing and debugging.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onAuditLog}
                    >
                        View Audit Log
                    </AppButton>
                </AppCard>

                <AppText variant="subheading" style={styles.sectionTitle}>
                    Maintenance
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Verify and repair account balance inconsistencies if needed.
                    </AppText>
                    <AppButton
                        variant="secondary"
                        onPress={onFixIntegrity}
                        loading={isMaintenanceMode}
                    >
                        Fix Integrity Issues
                    </AppButton>
                </AppCard>

                <AppText variant="subheading" style={[styles.sectionTitle, { color: theme.error }]}
                >
                    Danger Zone
                </AppText>
                <AppCard elevation="sm" padding="md" style={[styles.card, { borderColor: withOpacity(theme.error, Opacity.soft), borderWidth: 1 }]}
                >
                    <AppText variant="body" style={styles.cardDesc}>
                        Permanently delete soft-deleted records to free up space.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={onCleanup}
                        style={{ borderColor: theme.error }}
                        loading={isCleaning}
                    >
                        Cleanup Deleted Data
                    </AppButton>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="body" style={styles.cardDesc}>
                        Wipe all data and reset the app to its original state.
                    </AppText>
                    <AppButton
                        variant="primary"
                        onPress={onFactoryReset}
                        style={{ backgroundColor: theme.error }}
                        loading={isResetting}
                    >
                        Factory Reset
                    </AppButton>
                </AppCard>

                <View style={styles.footer}>
                    <AppText variant="caption" color="secondary">
                        Balance v1.0.0
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
    sectionTitle: {
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
        fontFamily: Typography.fonts.bold,
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
