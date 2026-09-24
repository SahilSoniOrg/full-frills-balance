import type { PostingPlan } from '@/src/types/domainTransaction';
import type { JournalBalancePolicy } from '@/src/services/accounting/journalBalanceEvaluator';
import type { JournalId } from '@/src/types/ids';
import { showErrorAlert } from '@/src/utils/alerts';
import { triggerSaveOutcomeHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { useCallback, useRef, useState } from 'react';
import type { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';

type PostPostingPlan = ReturnType<typeof useJournalActions>['postPostingPlan'];

export function useJournalEditorSubmission(options: {
  postPostingPlan: PostPostingPlan;
  journalId?: JournalId;
  smsId?: string;
  smsRecordId?: string;
  smsSender?: string;
  rawSmsBody?: string;
  onAfterSave?: (result: {
    journalId?: JournalId;
    action?: 'created' | 'updated';
  }) => Promise<void>;
  onSuccess?: () => void;
}) {
  const {
    postPostingPlan,
    journalId,
    smsId,
    smsRecordId,
    smsSender,
    rawSmsBody,
    onAfterSave,
    onSuccess,
  } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlightRef = useRef(false);

  const submitPlan = useCallback(
    async (
      plan: PostingPlan,
      mode: 'simple' | 'advanced' | 'import',
      balancePolicy?: JournalBalancePolicy,
    ) => {
      if (submissionInFlightRef.current) {
        return { success: false, error: 'Submission already in progress' } as const;
      }
      submissionInFlightRef.current = true;
      setIsSubmitting(true);
      try {
        const result = await postPostingPlan({
          plan,
          journalId,
          mode,
          balancePolicy,
          smsId,
          smsRecordId,
          smsSender,
          rawSmsBody,
        });

        if (!result.success) {
          triggerSaveOutcomeHaptic(false);
          showErrorAlert(result.error || 'Unknown error');
          return result;
        }

        void Promise.resolve()
          .then(() => onAfterSave?.({ journalId: result.journalId, action: result.action }))
          .catch(error => logger.error('Post-commit journal effect failed:', error));

        triggerSaveOutcomeHaptic(true);
        onSuccess?.();
        return result;
      } catch {
        triggerSaveOutcomeHaptic(false);
        showErrorAlert('Unexpected error occurred');
        return { success: false, error: 'Unexpected error occurred' } as const;
      } finally {
        submissionInFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [journalId, onAfterSave, onSuccess, postPostingPlan, rawSmsBody, smsId, smsRecordId, smsSender],
  );

  return { isSubmitting, submitPlan };
}
