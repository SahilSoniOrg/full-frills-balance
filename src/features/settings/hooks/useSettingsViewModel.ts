import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { logger } from '@/src/utils/logger';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

export interface SettingsViewModel {
    themePreference: 'system' | 'light' | 'dark';
    setThemePreference: (value: 'system' | 'light' | 'dark') => void;
    themeId: ThemeId;
    setThemeId: (value: ThemeId) => void;
    fontId: FontId;
    setFontId: (value: FontId) => void;
    isPrivacyMode: boolean;
    onTogglePrivacy: () => void;
    showAccountMonthlyStats: boolean;
    onToggleAccountMonthlyStats: () => void;
    isExporting: boolean;
    isImporting: boolean;
    isMaintenanceMode: boolean;
    isCleaning: boolean;
    isResetting: boolean;
    onExport: () => void;
    onImport: () => void;
    onAuditLog: () => void;
    onFixIntegrity: () => void;
    onCleanup: () => void;
    onFactoryReset: () => void;
}

export function useSettingsViewModel(): SettingsViewModel {
    const router = useRouter();
    const ui = useUI();
    const {
        themePreference,
        setThemePreference,
        isPrivacyMode,
        setPrivacyMode,
        showAccountMonthlyStats,
        setShowAccountMonthlyStats,
    } = ui;
    const { exportToJSON, runIntegrityCheck, cleanupDatabase, resetApp } = useSettingsActions();
    const { isImporting: isImportingData } = useImport();
    const [isExporting, setIsExporting] = useState(false);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const onExport = useCallback(async () => {
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
    }, [exportToJSON]);

    const onFixIntegrity = useCallback(async () => {
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
    }, [runIntegrityCheck]);

    const onCleanup = useCallback(async () => {
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
    }, [cleanupDatabase]);

    const onFactoryReset = useCallback(async () => {
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
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Alert.alert('Error', `Reset failed: ${msg}`);
        } finally {
            setIsResetting(false);
        }
    }, [resetApp]);

    return {
        themePreference,
        setThemePreference,
        themeId: ui.themeId,
        setThemeId: ui.setThemeId,
        fontId: ui.fontId,
        setFontId: ui.setFontId,
        isPrivacyMode,
        onTogglePrivacy: () => setPrivacyMode(!isPrivacyMode),
        showAccountMonthlyStats,
        onToggleAccountMonthlyStats: () => setShowAccountMonthlyStats(!showAccountMonthlyStats),
        isExporting,
        isImporting: isImportingData,
        isMaintenanceMode,
        isCleaning,
        isResetting,
        onExport,
        onImport: () => router.push('/import-selection'),
        onAuditLog: () => router.push('/audit-log'),
        onFixIntegrity,
        onCleanup,
        onFactoryReset,
    };
}
