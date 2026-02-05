import { AuditLogView } from '@/src/features/audit/components/AuditLogView';
import { useAuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import React from 'react';

export default function AuditLogScreen() {
    const vm = useAuditLogViewModel();
    return <AuditLogView {...vm} />;
}
