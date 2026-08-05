import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { AuditLogView } from '@/src/features/audit/components/AuditLogView';
import { useAuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import { useMemo } from 'react';

export default function AuditLogScreen() {
  const vm = useAuditLogViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: vm.isFiltered
        ? AppConfig.strings.audit.editHistory
        : AppConfig.strings.audit.logTitle,
      showBack: true,
      backIcon: 'back',
    }),
    [vm.isFiltered],
  );
  return <AuditLogView {...vm} chrome={chrome} />;
}
