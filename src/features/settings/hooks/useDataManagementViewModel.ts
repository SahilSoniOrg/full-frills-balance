import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { ShareFormat } from '@/src/types/sharing';
import { AppNavigation } from '@/src/utils/navigation';

export interface DataManagementViewModel {
  onImport: () => void;
  onAuditLog: () => void;
  defaultShareFormat: ShareFormat;
  setDefaultShareFormat: (value: ShareFormat) => void;
}

export function useDataManagementViewModel(): DataManagementViewModel {
  const { defaultShareFormat, setDefaultShareFormat } = useSharePrefs();

  return {
    onImport: () => AppNavigation.toSetupJourney('settings_restore'),
    onAuditLog: AppNavigation.toAuditLog,
    defaultShareFormat,
    setDefaultShareFormat,
  };
}
