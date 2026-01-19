import { AppButton, AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { exportService } from '@/src/services/export-service';
import { logger } from '@/src/utils/logger';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

export default function ReportsScreen() {
    const { theme } = useTheme();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const jsonData = await exportService.exportToJSON();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `balance-export-${timestamp}.json`;

            // Web: Use browser download
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

            // Native: Use file system + sharing
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
            Alert.alert('Export Failed', 'Could not export data. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <AppCard elevation="sm" padding="lg" style={styles.section}>
                <AppText variant="body" color="secondary" style={styles.description}>
                    Export all your accounts, journals, and transactions as a JSON file.
                </AppText>
                <AppButton
                    variant="primary"
                    onPress={handleExport}
                    loading={isExporting}
                >
                    {isExporting ? 'Exporting...' : 'Export to JSON'}
                </AppButton>
            </AppCard>

            <AppCard elevation="none" padding="lg" style={styles.section}>
                <AppText variant="body" color="secondary" style={styles.description}>
                    Coming Soon: Net Worth trends, Income vs Expense charts, and account-level analytics.
                </AppText>
            </AppCard>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: Spacing.lg,
    },
    section: {
        marginBottom: Spacing.lg,
    },
    description: {
        marginVertical: Spacing.md,
    },
});
