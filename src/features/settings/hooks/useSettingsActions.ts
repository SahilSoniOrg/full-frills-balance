import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
import { exportService } from '@/src/services/export-service';
import { integrityService } from '@/src/services/integrity-service';
import { preferences } from '@/src/utils/preferences';
import { useCallback } from 'react';

export function useSettingsActions() {
    const { requireRestart } = useUI();

    const exportToJSON = useCallback(async () => {
        return exportService.exportToJSON();
    }, []);

    const runIntegrityCheck = useCallback(async () => {
        return integrityService.runStartupCheck();
    }, []);

    const cleanupDatabase = useCallback(async () => {
        return integrityService.cleanupDatabase();
    }, []);

    const resetApp = useCallback(async () => {
        analytics.logFactoryReset();
        await integrityService.resetDatabase();
        await preferences.clearPreferences();
        requireRestart({ type: 'RESET' });
    }, [requireRestart]);

    return {
        exportToJSON,
        runIntegrityCheck,
        cleanupDatabase,
        resetApp,
    };
}
