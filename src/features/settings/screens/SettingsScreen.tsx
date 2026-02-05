import { AppButton, AppCard, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { CurrencyPreference } from '@/src/features/settings/components/CurrencyPreference';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

export default function SettingsScreen() {
    const { theme } = useTheme();
    const router = useRouter();
    const ui = useUI();
    const {
        themePreference,
        setThemePreference,
        isPrivacyMode,
        setPrivacyMode,
    } = ui;
    const { exportToJSON, runIntegrityCheck, cleanupDatabase, resetApp } = useSettingsActions();
    const { isImporting: isImportingData } = useImport();
    const [isExporting, setIsExporting] = useState(false);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const jsonData = await exportToJSON();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `balance-export-${timestamp}.json`;

            if (Platform.OS === 'web') {
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return;
            }

            const fileUri = `${FileSystem.documentDirectory}${filename}`;
            await FileSystem.writeAsStringAsync(fileUri, jsonData);

            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: 'Export Your Balance Data',
                });
            } else {
                Alert.alert('Export Ready', `File saved to ${fileUri}`);
            }
        } catch (error) {
            logger.error('Export failed', error);
            Alert.alert('Export Failed', 'Could not export data.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleFixIntegrity = async () => {
        setIsMaintenanceMode(true);
        try {
            const result = await runIntegrityCheck();
            Alert.alert(
                'Integrity Check Complete',
                `Checked ${result.totalAccounts} accounts.\nFound ${result.discrepanciesFound} issues.\nRepaired ${result.repairsSuccessful} successfully.`
            );
        } catch (error) {
            logger.error('Integrity check failed', error);
            Alert.alert('Error', 'Failed to run integrity check.');
        } finally {
            setIsMaintenanceMode(false);
        }
    };

    const handleCleanup = async () => {
        const proceed = Platform.OS === 'web'
            ? confirm('This will permanently delete synced records marked as deleted (journals, transactions, accounts). Unsynced deletions are preserved for sync. This action is irreversible. Continue?')
            : await new Promise<boolean>(resolve => {
                Alert.alert(
                    'Cleanup Database',
                    'This will permanently delete synced records marked as deleted (journals, transactions, accounts). Unsynced deletions are preserved for sync. This action is irreversible. Continue?',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                        { text: 'Cleanup', style: 'destructive', onPress: () => resolve(true) }
                    ]
                );
            });

        if (!proceed) return;

        try {
            setIsCleaning(true);
            const result = await cleanupDatabase();
            Alert.alert('Cleanup Complete', `Permanently removed ${result.deletedCount} synced records.`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert('Error', `Cleanup failed: ${msg}`);
        } finally {
            setIsCleaning(false);
        }
    };

    const handleFactoryReset = async () => {
        const proceed = Platform.OS === 'web'
            ? confirm('FACTORY RESET: THIS WILL PERMANENTLY ERASE ALL YOUR DATA. THIS CANNOT BE UNDONE. Are you absolutely sure?')
            : await new Promise<boolean>(resolve => {
                Alert.alert(
                    'FACTORY RESET',
                    'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                        { text: 'RESET EVERYTHING', style: 'destructive', onPress: () => resolve(true) }
                    ]
                );
            });

        if (!proceed) return;

        try {
            setIsResetting(true);
            await resetApp();
            // Should not be reached if blocking UI works, but just in case
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert('Error', `Reset failed: ${msg}`);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <Screen
            showBack={false}
            scrollable
            withPadding
        >
            <View style={styles.inner}>
                {/* General Section */}
                <AppText variant="subheading" style={styles.sectionTitle}>
                    General
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <CurrencyPreference />
                </AppCard>

                {/* Appearance Section */}
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
                            onPress={() => setPrivacyMode(!isPrivacyMode)}
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
                            variant={ui.showAccountMonthlyStats ? 'primary' : 'outline'}
                            size="sm"
                            onPress={() => ui.setShowAccountMonthlyStats(!ui.showAccountMonthlyStats)}
                        >
                            {ui.showAccountMonthlyStats ? 'On' : 'Off'}
                        </AppButton>
                    </View>
                </AppCard>

                {/* Data Section */}
                <AppText variant="subheading" style={styles.sectionTitle}>
                    Data Management
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Export your data as a JSON file for backup or external use.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={handleExport}
                        loading={isExporting}
                    >
                        Export to JSON
                    </AppButton>

                    <AppButton
                        variant="outline"
                        onPress={() => router.push('/import-selection')}
                        loading={isImportingData}
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
                        onPress={() => router.push('/audit-log')}
                    >
                        View Audit Log
                    </AppButton>
                </AppCard>

                {/* Maintenance Section */}
                <AppText variant="subheading" style={styles.sectionTitle}>
                    Maintenance
                </AppText>
                <AppCard elevation="sm" padding="md" style={styles.card}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Verify and repair account balance inconsistencies if needed.
                    </AppText>
                    <AppButton
                        variant="secondary"
                        onPress={handleFixIntegrity}
                        loading={isMaintenanceMode}
                    >
                        Fix Integrity Issues
                    </AppButton>
                </AppCard>

                {/* Danger Zone */}
                <AppText variant="subheading" style={[styles.sectionTitle, { color: theme.error }]}>
                    Danger Zone
                </AppText>
                <AppCard elevation="sm" padding="md" style={[styles.card, { borderColor: withOpacity(theme.error, Opacity.soft), borderWidth: 1 }]}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Permanently delete soft-deleted records to free up space.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={handleCleanup}
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
                        onPress={handleFactoryReset}
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
