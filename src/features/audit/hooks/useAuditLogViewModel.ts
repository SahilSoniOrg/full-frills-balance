import { useAuditAccounts } from '@/src/features/audit/hooks/useAuditData';
import { useAuditLogs } from '@/src/features/audit/hooks/useAuditLogs';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

export interface AuditLogViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    logs: ReturnType<typeof useAuditLogs>['logs'];
    accountMap: ReturnType<typeof useAuditAccounts>['accountMap'];
    isLoading: boolean;
    isFiltered: boolean;
    expandedIds: Set<string>;
    onToggleExpanded: (id: string) => void;
}

export function useAuditLogViewModel(): AuditLogViewModel {
    const { theme } = useTheme();
    const { entityType, entityId } = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const { accountMap, isLoading: accountsLoading } = useAuditAccounts();
    const { logs, isLoading } = useAuditLogs({ entityType, entityId });

    const isFiltered = !!entityId;

    const onToggleExpanded = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    return {
        theme,
        logs,
        accountMap,
        isLoading: isLoading || accountsLoading,
        isFiltered,
        expandedIds,
        onToggleExpanded,
    };
}
