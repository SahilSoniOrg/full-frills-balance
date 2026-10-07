import { useState } from 'react';
import { AppConfig } from '@/src/constants';
import { analytics } from '@/src/services/analytics';
import { revertEntry } from '@/src/services/audit-service';
import type { WorkplaceId } from '@/src/types/ids';
import { toast } from '@/src/utils/alerts';
import { ConfirmDialog } from './ConfirmDialog';

export interface RevertChangeRequest {
  logId: string;
  title: string;
  message: string;
  confirmLabel: string;
}

/** Confirms and reverts one audit entry. Stays open on failure so the person can retry. */
export function RevertChangeDialog({
  request,
  workplaceId,
  surface,
  onClose,
}: {
  request: RevertChangeRequest | null;
  workplaceId: WorkplaceId;
  surface: 'audit_log' | 'journal_details';
  onClose: () => void;
}) {
  const [reverting, setReverting] = useState(false);
  const strings = AppConfig.strings.audit;
  const confirm = async () => {
    if (!request || reverting) return;
    setReverting(true);
    analytics.trackFeatureUsage('audit', 'revert_initiated', { surface });
    try {
      const result = await revertEntry(request.logId, workplaceId);
      if (result.success) {
        analytics.trackFeatureUsage('audit', 'revert_success', { surface });
        toast.success(strings.revertSuccess);
        onClose();
      } else {
        analytics.trackFeatureUsage('audit', 'revert_failed', { surface });
        toast.error(result.error ?? strings.errors.revertFailed);
      }
    } finally {
      setReverting(false);
    }
  };
  return (
    <ConfirmDialog
      visible={!!request}
      title={request?.title ?? ''}
      message={request?.message}
      onClose={() => {
        if (!reverting) onClose();
      }}
      primaryAction={{
        label: request?.confirmLabel ?? strings.revertCta,
        disabled: reverting,
        onPress: confirm,
      }}
      secondaryAction={{
        label: AppConfig.strings.common.cancel,
        disabled: reverting,
        onPress: onClose,
      }}
    />
  );
}
