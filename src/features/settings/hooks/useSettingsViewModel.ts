import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { alert, confirm, toast } from '@/src/utils/alerts';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export interface SettingsViewModel {
    userName: string;
    setUserName: (value: string) => void;
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
    archetype: string;
    setArchetype: (value: string) => void;
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
        userName,
        updateUserDetails,
        themePreference,
        setThemePreference,
        isPrivacyMode,
        setPrivacyMode,
        showAccountMonthlyStats,
        setShowAccountMonthlyStats,
        archetype,
        setArchetype,
    } = ui;
    const { exportToJSON, runIntegrityCheck, cleanupDatabase, resetApp } = useSettingsActions();
    const { isImporting: isImportingData } = useImport();
    const [isExporting, setIsExporting] = useState(false);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const setUserName = useCallback((newName: string) => {
        if (newName.trim() && newName !== userName) {
            updateUserDetails(newName.trim(), ui.defaultCurrency, archetype);
        }
    }, [ui.defaultCurrency, archetype, updateUserDetails, userName]);

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
                alert.show({ title: 'Export Ready', message: `File saved to ${fileUri}` });
            }
        } catch {
            toast.error('Could not export data');
        } finally {
            setIsExporting(false);
        }
    }, [exportToJSON]);

    const onFixIntegrity = useCallback(async () => {
        setIsMaintenanceMode(true);
        try {
            const result = await runIntegrityCheck();
            alert.show({
                title: 'Integrity Check Complete',
                message: `Checked ${result.totalAccounts} accounts.\nFound ${result.discrepanciesFound} issues.\nRepaired ${result.repairsSuccessful} successfully.`
            });
        } finally {
            setIsMaintenanceMode(false);
        }
    }, [runIntegrityCheck]);

    const onCleanup = useCallback(async () => {
        confirm.show({
            title: 'Cleanup Database',
            message: 'This will permanently delete synced records marked as deleted (journals, transactions, accounts). Unsynced deletions are preserved for sync. This action is irreversible. Continue?',
            confirmText: 'Cleanup',
            destructive: true,
            onConfirm: async () => {
                try {
                    setIsCleaning(true);
                    const result = await cleanupDatabase();
                    alert.show({ title: 'Cleanup Complete', message: `Permanently removed ${result.deletedCount} synced records.` });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    alert.show({ title: 'Error', message: `Cleanup failed: ${msg}`, type: 'error' });
                } finally {
                    setIsCleaning(false);
                }
            }
        });
    }, [cleanupDatabase]);

    const onFactoryReset = useCallback(async () => {
        confirm.show({
            title: 'FACTORY RESET',
            message: 'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
            confirmText: 'RESET EVERYTHING',
            destructive: true,
            onConfirm: async () => {
                try {
                    setIsResetting(true);
                    await resetApp();
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    alert.show({ title: 'Error', message: `Reset failed: ${msg}`, type: 'error' });
                } finally {
                    setIsResetting(false);
                }
            }
        });
    }, [resetApp]);

    return {
        userName,
        setUserName,
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
        archetype,
        setArchetype,
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
