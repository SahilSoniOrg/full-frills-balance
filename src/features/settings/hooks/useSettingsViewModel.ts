import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { useSettingsActions } from '@/src/features/settings/hooks/useSettingsActions';
import { useImport } from '@/src/hooks/use-import';
import { analytics } from '@/src/services/analytics-service';
import { alert, confirm, toast } from '@/src/utils/alerts';
import * as LocalAuthentication from '@/src/utils/auth';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

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
  isWidgetPrivacyEnabled: boolean;
  onToggleWidgetPrivacy: () => void;
  isAppLockEnabled: boolean;
  onToggleAppLock: () => void;
  showAccountMonthlyStats: boolean;
  onToggleAccountMonthlyStats: () => void;
  isExporting: boolean;
  isImporting: boolean;
  isMaintenanceMode: boolean;
  isCleaning: boolean;
  isResetting: boolean;
  isNamingExport: boolean;
  setIsNamingExport: (value: boolean) => void;
  exportFilename: string;
  setExportFilename: (value: string) => void;
  onExport: () => void;
  onConfirmExport: () => void;
  onImport: () => void;
  onAuditLog: () => void;
  onSmsInbox: () => void;
  onManageSmsRules: () => void;
  onPersonalizationSettings: () => void;
  onDataManagementSettings: () => void;
  onAppearanceSettings: () => void;
  onFixIntegrity: () => void;
  integrityProgress: number;
  integrityProgressMessage: string;
  onCleanup: () => void;
  onFactoryReset: () => void;
}

export function useSettingsViewModel(): SettingsViewModel {
  const ui = useUI();
  const {
    userName,
    updateUserDetails,
    themePreference,
    setThemePreference,
    isPrivacyMode,
    setPrivacyMode,
    isAppLockEnabled,
    setAppLockEnabled,
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
    isWidgetPrivacyEnabled,
    setWidgetPrivacyEnabled,
  } = ui;
  const { exportToJSON, runIntegrityCheck, cleanupDatabase, resetApp } = useSettingsActions();
  const { isImporting: isImportingData } = useImport();
  const [isExporting, setIsExporting] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [integrityProgress, setIntegrityProgress] = useState(0);
  const [integrityProgressMessage, setIntegrityProgressMessage] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isNamingExport, setIsNamingExport] = useState(false);
  const [exportFilename, setExportFilename] = useState('');

  const setUserName = useCallback(
    (newName: string) => {
      if (newName.trim() && newName !== userName) {
        updateUserDetails(newName.trim(), ui.defaultCurrency, ui.archetype);

        // Track Analytics
        analytics.trackFeatureUsage('settings', 'change_name', {
          name_length: newName.trim().length,
        });
      }
    },
    [ui.defaultCurrency, ui.archetype, updateUserDetails, userName],
  );

  const onExport = useCallback(() => {
    setIsNamingExport(true);
  }, []);

  const onConfirmExport = useCallback(async () => {
    setIsNamingExport(false);
    setIsExporting(true);
    try {
      const jsonData = await exportToJSON();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      // Sanitize filename and use default if empty
      const sanitizedName = exportFilename
        .trim()
        .replace(/[^a-z0-9-_]/gi, '-')
        .substring(0, 50);
      const filename = sanitizedName
        ? `${sanitizedName}-${timestamp}.json`
        : `balance-export-${timestamp}.json`;

      // Track Analytics
      analytics.trackFeatureUsage('settings', 'export_data', {
        has_custom_filename: !!sanitizedName,
        filename_length: sanitizedName.length,
        data_size_bytes: jsonData.length,
      });

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

      // On Android, provide an option to save to a user-selected location
      if (Platform.OS === 'android') {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          try {
            const fileLocation = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              filename,
              'application/json',
            );
            await FileSystem.writeAsStringAsync(fileLocation, jsonData);
            toast.success('Backup saved successfully');
          } catch (err) {
            logger.error('[onConfirmExport] SAF save failed', err);
          }
        }
      }

      confirm.show({
        title: 'Backup Generated',
        message: 'Your backup has been created. Would you like to share or upload the file now?',
        confirmText: 'Share File',
        cancelText: 'Just Save',
        onConfirm: async () => {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Export Your Balance Data',
            });
          } else {
            alert.show({ title: 'Export Ready', message: `File saved to ${fileUri}` });
          }
        },
      });
    } catch (error) {
      logger.error('[onConfirmExport] Export failed', error);
      toast.error('Could not export data');
    } finally {
      setIsExporting(false);
    }
  }, [exportToJSON, exportFilename]);

  const onFixIntegrity = useCallback(async () => {
    setIntegrityProgress(0);
    setIntegrityProgressMessage('Starting check...');
    setIsMaintenanceMode(true);
    try {
      const result = await runIntegrityCheck((message, progress) => {
        setIntegrityProgressMessage(message);
        setIntegrityProgress(progress);
      });

      // Close progress modal first
      setIsMaintenanceMode(false);

      // On iOS, wait for modal dismissal animation to complete to ensure the JS alert overlay is visible
      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      alert.show({
        title: 'Integrity Check Complete',
        message: `Checked ${result.totalAccounts} accounts.\nFound ${result.discrepanciesFound} issues.\nRepaired ${result.repairsSuccessful} successfully.`,
      });

      // Track Analytics
      analytics.trackFeatureUsage('settings', 'integrity_check', {
        accounts_checked: result.totalAccounts,
        issues_found: result.discrepanciesFound,
        repairs_successful: result.repairsSuccessful,
      });
    } catch (error) {
      setIsMaintenanceMode(false);
      logger.error('[onFixIntegrity] Check failed', error);
      toast.error('Integrity check failed');
    }
  }, [runIntegrityCheck]);

  const onCleanup = useCallback(async () => {
    confirm.show({
      title: 'Cleanup Database',
      message:
        'This will permanently delete synced records marked as deleted (journals, transactions, accounts). Unsynced deletions are preserved for sync. This action is irreversible. Continue?',
      confirmText: 'Cleanup',
      destructive: true,
      onConfirm: async () => {
        try {
          setIsCleaning(true);
          const result = await cleanupDatabase();
          alert.show({
            title: 'Cleanup Complete',
            message: `Permanently removed ${result.deletedCount} synced records.`,
          });

          // Track Analytics
          analytics.trackFeatureUsage('settings', 'cleanup_database', {
            records_removed: result.deletedCount,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          alert.show({ title: 'Error', message: `Cleanup failed: ${msg}`, type: 'error' });
        } finally {
          setIsCleaning(false);
        }
      },
    });
  }, [cleanupDatabase]);

  const onFactoryReset = useCallback(async () => {
    confirm.show({
      title: 'FACTORY RESET',
      message:
        'THIS WILL PERMANENTLY ERASE ALL YOUR DATA, ACCOUNTS, AND SETTINGS. THIS CANNOT BE UNDONE. Are you absolutely sure?',
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
      },
    });
  }, [resetApp]);

  const onToggleAppLock = useCallback(async () => {
    if (isAppLockEnabled) {
      // Turning it off, maybe prompt for authentication to disable?
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to disable App Lock',
      });
      if (result.success) {
        setAppLockEnabled(false);
      }
    } else {
      // Turning it on
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        if (Platform.OS === 'web') {
          alert.show({
            title: 'Authentication not set up',
            message: 'Your browser does not support Passkeys (WebAuthn).',
            type: 'error',
          });
          return;
        }

        confirm.show({
          title: 'Setup Required',
          message:
            'Your device does not have a screen lock or biometric authentication set up. Please configure one in your device settings to enable App Lock.',
          confirmText: 'Go to Settings',
          cancelText: 'Dismiss',
          onConfirm: () => {
            if (Platform.OS === 'android') {
              Linking.sendIntent('android.settings.SECURITY_SETTINGS').catch(() => {
                Linking.openSettings();
              });
            } else {
              Linking.openSettings();
            }
          },
        });
        return;
      }

      const result = await LocalAuthentication.enrollAsync({
        promptMessage: 'Authenticate to enable App Lock',
      });
      if (result.success) {
        setAppLockEnabled(true);
      }
    }
  }, [isAppLockEnabled, setAppLockEnabled]);

  return {
    userName,
    setUserName,
    themePreference,
    setThemePreference: (value: 'system' | 'light' | 'dark') => {
      setThemePreference(value);
      analytics.trackFeatureUsage('settings', 'change_theme_preference', {
        preference: value,
      });
    },
    themeId: ui.themeId,
    setThemeId: (value: ThemeId) => {
      ui.setThemeId(value);
      analytics.trackFeatureUsage('settings', 'change_theme', {
        theme_id: value,
      });
    },
    fontId: ui.fontId,
    setFontId: (value: FontId) => {
      ui.setFontId(value);
      analytics.trackFeatureUsage('settings', 'change_font', {
        font_id: value,
      });
    },
    isPrivacyMode,
    onTogglePrivacy: () => {
      setPrivacyMode(!isPrivacyMode);
      analytics.trackFeatureUsage('settings', 'toggle_privacy_mode', {
        new_state: !isPrivacyMode,
      });
    },
    isAppLockEnabled,
    onToggleAppLock,
    showAccountMonthlyStats,
    onToggleAccountMonthlyStats: () => {
      setShowAccountMonthlyStats(!showAccountMonthlyStats);
      analytics.trackFeatureUsage('settings', 'toggle_monthly_stats', {
        new_state: !showAccountMonthlyStats,
      });
    },
    isWidgetPrivacyEnabled,
    onToggleWidgetPrivacy: () => {
      setWidgetPrivacyEnabled(!isWidgetPrivacyEnabled);
      analytics.trackFeatureUsage('settings', 'toggle_widget_privacy', {
        new_state: !isWidgetPrivacyEnabled,
      });
    },
    isExporting,
    isImporting: isImportingData,
    isMaintenanceMode,
    integrityProgress,
    integrityProgressMessage,
    isCleaning,
    isResetting,
    isNamingExport,
    setIsNamingExport,
    exportFilename,
    setExportFilename,
    onExport,
    onConfirmExport,
    onImport: AppNavigation.toImportSelection,
    onAuditLog: AppNavigation.toAuditLog,
    onSmsInbox: AppNavigation.toSmsInbox,
    onManageSmsRules: AppNavigation.toSmsRules,
    onPersonalizationSettings: AppNavigation.toPersonalizationSettings,
    onDataManagementSettings: AppNavigation.toDataManagementSettings,
    onAppearanceSettings: AppNavigation.toAppearanceSettings,
    onFixIntegrity,
    onCleanup,
    onFactoryReset,
  };
}
