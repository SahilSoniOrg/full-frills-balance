import { AppButton, AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useTheme } from '@/hooks/use-theme';
import { exportService } from '@/src/services/export-service';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

export default function SettingsScreen() {
    const { theme } = useTheme();
    const router = useRouter();
    const {
        themePreference,
        setThemePreference,
        isPrivacyMode,
        setPrivacyMode,
        resetApp,
        cleanupDatabase,
        isLoading
    } = useUI();
    const [isExporting, setIsExporting] = useState(false);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const jsonData = await exportService.exportToJSON();
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
            const result = await integrityService.runStartupCheck();
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
        logger.debug('[Settings] User clicked Cleanup Database');

        const proceed = Platform.OS === 'web'
            ? confirm('This will permanently delete all records marked as deleted (journals, transactions, accounts). This action is irreversible. Continue?')
            : await new Promise<boolean>(resolve => {
                Alert.alert(
                    'Cleanup Database',
                    'This will permanently delete all records marked as deleted (journals, transactions, accounts). This action is irreversible. Continue?',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => { logger.debug('[Settings] Cleanup cancelled'); resolve(false); } },
                        { text: 'Cleanup', style: 'destructive', onPress: () => resolve(true) }
                    ]
                );
            });

        if (!proceed) return;

        logger.info('[Settings] Starting database cleanup process...');
        try {
            const result = await cleanupDatabase();
            logger.info(`[Settings] Cleanup success: ${result.deletedCount} items removed`);
            Alert.alert('Cleanup Complete', `Permanently removed ${result.deletedCount} records.`);
        } catch (error) {
            logger.error('[Settings] Cleanup action failed', error);
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert('Error', `Cleanup failed: ${msg}`);
        }
    };

    const handleFactoryReset = async () => {
        logger.warn('[Settings] User clicked FACTORY RESET');

        const proceed = Platform.OS === 'web'
            ? confirm('FACTORY RESET: THIS WILL PERMANENTLY ERASE ALL YOUR DATA. THIS CANNOT BE UNDONE. Are you absolutely sure?')
            : await new Promise<boolean>(resolve => {
                Alert.alert(
                    'FACTORY RESET',
                    'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => { logger.debug('[Settings] Reset cancelled'); resolve(false); } },
                        { text: 'RESET EVERYTHING', style: 'destructive', onPress: () => resolve(true) }
                    ]
                );
            });

        if (!proceed) return;

        logger.warn('[Settings] Initiating EVERYTHING RESET...');
        try {
            await resetApp();
            logger.info('[Settings] App reset successful');
        } catch (error) {
            logger.error('[Settings] Reset action failed', error);
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert('Error', `Reset failed: ${msg}`);
        }
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.inner}>
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

                    <View style={styles.divider} />

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

                    <View style={styles.divider} />

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
                <AppCard elevation="sm" padding="md" style={[styles.card, { borderColor: theme.error + '44', borderWidth: 1 }]}>
                    <AppText variant="body" style={styles.cardDesc}>
                        Permanently delete soft-deleted records to free up space.
                    </AppText>
                    <AppButton
                        variant="outline"
                        onPress={handleCleanup}
                        style={{ borderColor: theme.error }}
                        loading={isLoading}
                    >
                        Cleanup Deleted Data
                    </AppButton>

                    <View style={styles.divider} />

                    <AppText variant="body" style={styles.cardDesc}>
                        Wipe all data and reset the app to its original state.
                    </AppText>
                    <AppButton
                        variant="primary"
                        onPress={handleFactoryReset}
                        style={{ backgroundColor: theme.error }}
                        loading={isLoading}
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
        </ScrollView>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    inner: {
        padding: Spacing.lg,
    },
    sectionTitle: {
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
        fontWeight: 'bold',
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
        backgroundColor: 'rgba(0,0,0,0.1)',
        marginVertical: Spacing.lg,
    },
    footer: {
        marginTop: Spacing.xl,
        alignItems: 'center',
        paddingBottom: Spacing.xl,
    },
});
