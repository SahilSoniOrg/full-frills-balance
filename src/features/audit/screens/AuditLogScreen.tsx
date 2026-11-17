import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AuditLogView } from '@/src/features/audit/components/AuditLogView';
import { useAuditLogViewModel } from '@/src/features/audit/hooks/useAuditLogViewModel';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useMemo } from 'react';

function AuditLogScreen() {
  const vm = useAuditLogViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () =>
      privacyNavChrome(
        vm.isFiltered ? AppConfig.strings.audit.editHistory : AppConfig.strings.audit.logTitle,
        AppNavigation.back,
      ),
    [vm.isFiltered],
  );
  return <AuditLogView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(AuditLogScreen);
