import { AppButton, AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useTheme } from '@/hooks/use-theme';
import { integrityService } from '@/src/services/IntegrityService';
import { exportService } from '@/src/services/export-service';
import { logger } from '@/src/utils/logger';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

export default function SettingsScreen() {
    const { theme, themeMode } = useTheme();
    const {
        themePreference,
        setThemePreference,
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

    const handleCleanup = () => {
        Alert.alert(
            'Cleanup Database',
            'This will permanently delete all records marked as deleted (journals, transactions, accounts). This action is irreversible. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Cleanup',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const result = await cleanupDatabase();
                            Alert.alert('Cleanup Complete', `Permanently removed ${result.deletedCount} records.`);
                        } catch (error) {
                            Alert.alert('Error', 'Cleanup failed.');
                        }
                    }
                }
            ]
        );
    };

    const handleFactoryReset = () => {
        Alert.alert(
            'FACTORY RESET',
            'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'RESET EVERYTHING',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await resetApp();
                            // UIContext will handle state update and redirect
                        } catch (error) {
                            Alert.alert('Error', 'Reset failed.');
                        }
                    }
                }
            ]
        );
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.inner}>
                {/* Appearance Section */}
                <AppText variant="subheading" themeMode={themeMode} style={styles.sectionTitle}>
                    Appearance
                </AppText>
                <AppCard elevation="sm" padding="md" themeMode={themeMode} style={styles.card}>
                    <View style={styles.themeOptions}>
                        {(['system', 'light', 'dark'] as const).map((pref) => (
                            <AppButton
                                key={pref}
                                variant={themePreference === pref ? 'primary' : 'outline'}
                                size="sm"
                                themeMode={themeMode}
                                onPress={() => setThemePreference(pref)}
                                style={styles.themeButton}
                            >
                                {pref.charAt(0).toUpperCase() + pref.slice(1)}
                            </AppButton>
                        ))}
                    </View>
                </AppCard>

                {/* Data Section */}
                <AppText variant="subheading" themeMode={themeMode} style={styles.sectionTitle}>
                    Data Management
                </AppText>
                <AppCard elevation="sm" padding="md" themeMode={themeMode} style={styles.card}>
                    <AppText variant="body" themeMode={themeMode} style={styles.cardDesc}>
                        Export your data as a JSON file for backup or external use.
                    </AppText>
                    <AppButton
                        variant="outline"
                        themeMode={themeMode}
                        onPress={handleExport}
                        loading={isExporting}
                    >
                        Export to JSON
                    </AppButton>
                </AppCard>

                {/* Maintenance Section */}
                <AppText variant="subheading" themeMode={themeMode} style={styles.sectionTitle}>
                    Maintenance
                </AppText>
                <AppCard elevation="sm" padding="md" themeMode={themeMode} style={styles.card}>
                    <AppText variant="body" themeMode={themeMode} style={styles.cardDesc}>
                        Verify and repair account balance inconsistencies if needed.
                    </AppText>
                    <AppButton
                        variant="secondary"
                        themeMode={themeMode}
                        onPress={handleFixIntegrity}
                        loading={isMaintenanceMode}
                    >
                        Fix Integrity Issues
                    </AppButton>
                </AppCard>

                {/* Danger Zone */}
                <AppText variant="subheading" themeMode={themeMode} style={[styles.sectionTitle, { color: theme.error }]}>
                    Danger Zone
                </AppText>
                <AppCard elevation="sm" padding="md" themeMode={themeMode} style={[styles.card, { borderColor: theme.error + '44', borderWidth: 1 }]}>
                    <AppText variant="body" themeMode={themeMode} style={styles.cardDesc}>
                        Permanently delete soft-deleted records to free up space.
                    </AppText>
                    <AppButton
                        variant="outline"
                        themeMode={themeMode}
                        onPress={handleCleanup}
                        style={{ borderColor: theme.error }}
                    >
                        <AppText variant="body" themeMode={themeMode} style={{ color: theme.error }}>
                            Cleanup Deleted Data
                        </AppText>
                    </AppButton>

                    <View style={styles.divider} />

                    <AppText variant="body" themeMode={themeMode} style={styles.cardDesc}>
                        Wipe all data and reset the app to its original state.
                    </AppText>
                    <AppButton
                        variant="primary"
                        themeMode={themeMode}
                        onPress={handleFactoryReset}
                        style={{ backgroundColor: theme.error }}
                    >
                        Factory Reset
                    </AppButton>
                </AppCard>

                <View style={styles.footer}>
                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
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
