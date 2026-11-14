import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface ImportStats {
  workplaceId?: string;
  accounts: number;
  categories?: number;
  journals: number;
  transactions: number;
  budgets?: number;
  auditLogs?: number;
  plannedPayments?: number;
  skippedTransactions: number;
  skippedItems?: { id: string; reason: string; description?: string }[];
  preImportBackupPath?: string;
}

export interface RestartOptions {
  type: 'IMPORT' | 'RESET' | 'SEED_MOCK';
  stats?: ImportStats;
}

export interface AppRestartValue {
  isRestartRequired: boolean;
  isResetInProgress: boolean;
  restartType: 'IMPORT' | 'RESET' | 'SEED_MOCK' | null;
  importStats: ImportStats | null;
  beginReset: () => void;
  cancelReset: () => void;
  requireRestart: (options: RestartOptions) => void;
}

export const AppRestartContext = createContext<AppRestartValue | undefined>(undefined);

export function useAppRestart(): AppRestartValue {
  return requireShellContext(useContext(AppRestartContext), 'useAppRestart');
}

const INITIAL_RESTART: Pick<
  AppRestartValue,
  'isRestartRequired' | 'isResetInProgress' | 'restartType' | 'importStats'
> = {
  isRestartRequired: false,
  isResetInProgress: false,
  restartType: null,
  importStats: null,
};

export function AppRestartProvider({ children }: { children: React.ReactNode }) {
  const [restart, setRestart] = useState(INITIAL_RESTART);

  const beginReset = useCallback(() => {
    setRestart({
      isRestartRequired: false,
      isResetInProgress: true,
      restartType: 'RESET',
      importStats: null,
    });
  }, []);

  const cancelReset = useCallback(() => {
    setRestart({
      isRestartRequired: false,
      isResetInProgress: false,
      restartType: null,
      importStats: null,
    });
  }, []);

  const requireRestart = useCallback((options: RestartOptions) => {
    setRestart({
      isRestartRequired: true,
      isResetInProgress: false,
      restartType: options.type,
      importStats: options.stats || null,
    });
  }, []);

  const value = useMemo<AppRestartValue>(
    () => ({
      ...restart,
      beginReset,
      cancelReset,
      requireRestart,
    }),
    [restart, beginReset, cancelReset, requireRestart],
  );

  return <AppRestartContext.Provider value={value}>{children}</AppRestartContext.Provider>;
}
