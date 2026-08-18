import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface ImportStats {
  accounts: number;
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
  restartType: 'IMPORT' | 'RESET' | 'SEED_MOCK' | null;
  importStats: ImportStats | null;
  requireRestart: (options: RestartOptions) => void;
}

export const AppRestartContext = createContext<AppRestartValue | undefined>(undefined);

export function useAppRestart(): AppRestartValue {
  return requireShellContext(useContext(AppRestartContext), 'useAppRestart');
}

const INITIAL_RESTART: Omit<AppRestartValue, 'requireRestart'> = {
  isRestartRequired: false,
  restartType: null,
  importStats: null,
};

export function AppRestartProvider({ children }: { children: React.ReactNode }) {
  const [restart, setRestart] = useState(INITIAL_RESTART);

  const requireRestart = useCallback((options: RestartOptions) => {
    setRestart({
      isRestartRequired: true,
      restartType: options.type,
      importStats: options.stats || null,
    });
  }, []);

  const value = useMemo<AppRestartValue>(
    () => ({
      ...restart,
      requireRestart,
    }),
    [restart, requireRestart],
  );

  return <AppRestartContext.Provider value={value}>{children}</AppRestartContext.Provider>;
}
