import { useAccounts } from '@/src/components/account-selection';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { smsService } from '@/src/services/sms-service';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { TransactionInboxItem } from '@/src/types/domainJournal';
import { showErrorAlert } from '@/src/utils/alerts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

export function useInboxDeepLink(args: {
  workplaceId: WorkplaceId;
  handleImport: (item: TransactionInboxItem) => void | Promise<void>;
  handleOpenJournal: (item: TransactionInboxItem) => void;
}) {
  const { reviewRecordId } = useLocalSearchParams<{ reviewRecordId?: string }>();
  const reviewing = useRef<string | null>(null);
  const { isLoading: areAccountsLoading } = useAccounts(args.workplaceId);
  // Keep latest handlers without re-firing the deep-link effect on identity churn.
  const handlersRef = useRef(args);
  useEffect(() => {
    handlersRef.current = args;
  }, [args]);

  useEffect(() => {
    if (!reviewRecordId || areAccountsLoading) return;
    if (reviewing.current === reviewRecordId) return;
    let cancelled = false;
    reviewing.current = reviewRecordId;
    const { workplaceId } = handlersRef.current;
    void (async () => {
      const record = await smsService.findInboxRecord(workplaceId, reviewRecordId);
      if (cancelled) return;
      if (record) {
        const [item] = await enrichTransactionInboxRecords(workplaceId, [record]);
        if (cancelled) return;
        if (item.linkedJournal) handlersRef.current.handleOpenJournal(item);
        else if (
          item.processingStatus === InboxProcessingStatus.PENDING ||
          item.processingStatus === InboxProcessingStatus.PARSE_FAILED
        )
          await handlersRef.current.handleImport(item);
      }
      if (!cancelled) router.setParams({ reviewRecordId: undefined });
    })().catch(error => {
      if (!cancelled) showErrorAlert(error, 'SMS review', true);
    });
    return () => {
      cancelled = true;
    };
  }, [reviewRecordId, areAccountsLoading]);

  useEffect(() => {
    reviewing.current = null;
  }, [args.workplaceId]);
}
