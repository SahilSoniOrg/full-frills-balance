import { AppConfig } from '@/src/constants/app-config';
import { analytics } from '@/src/services/analytics';
import { smsService } from '@/src/services/sms-service';
import { preferences } from '@/src/services/preferences';
import { syncGmailForWorkplace } from '@/src/services/email/gmailSyncService';
import type { SmsInboxCursor } from '@/src/types/smsInbox';
import type { WorkplaceId } from '@/src/types/ids';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { Platform } from 'react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export function useInboxScanActions(args: {
  workplaceId: WorkplaceId;
  pageSize: number;
  retry: () => void;
  loadMore: () => void;
}) {
  const { workplaceId, pageSize, retry, loadMore } = args;
  const workplaceRef = useRef(workplaceId);
  useEffect(() => {
    workplaceRef.current = workplaceId;
  }, [workplaceId]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [scanCursor, setScanCursor] = useState<SmsInboxCursor | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanningOlder, setIsScanningOlder] = useState(false);
  const [isRepairingOldUpiMerchants, setIsRepairingOldUpiMerchants] = useState(false);

  const showOldUpiMerchantRepair = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.workplace
        .observe(workplaceId, 'historicalSmsMerchantRepairVersion')
        .subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () =>
      preferences.workplace.getSnapshot(workplaceId).historicalSmsMerchantRepairVersion !==
      AppConfig.migrations.historicalSmsMerchantRepair,
    () =>
      preferences.workplace.getSnapshot(workplaceId).historicalSmsMerchantRepairVersion !==
      AppConfig.migrations.historicalSmsMerchantRepair,
  );

  useEffect(() => {
    let isMounted = true;
    const prime = async () => {
      try {
        if (Platform.OS !== 'android') return;
        const result = await smsService.scanRecentSmsPage(workplaceId, pageSize * 2);
        if (isMounted && workplaceRef.current === workplaceId) {
          setScanCursor(result.cursor);
          setHasOlderMessages(result.hasMore);
        }
      } catch (error) {
        if (workplaceRef.current === workplaceId) showErrorAlert(error, 'Transaction Inbox', true);
      }
    };
    void prime();
    return () => {
      isMounted = false;
    };
  }, [workplaceId, pageSize]);

  const handleRefresh = useCallback(async () => {
    const requestWorkplaceId = workplaceId;
    retry();
    setIsRefreshing(true);
    analytics.trackFeatureUsage('sms', 'inbox_bulk_sync', { mode: 'refresh' });
    try {
      if (Platform.OS === 'android') {
        const result = await smsService.scanRecentSmsPage(requestWorkplaceId, pageSize * 2);
        if (workplaceRef.current !== requestWorkplaceId) return;
        setScanCursor(result.cursor);
        setHasOlderMessages(result.hasMore);
      }
      if (Platform.OS !== 'web') await syncGmailForWorkplace(requestWorkplaceId);
      if (workplaceRef.current !== requestWorkplaceId) return;
      toast.success('Transaction inbox refreshed');
    } catch (error) {
      if (workplaceRef.current === requestWorkplaceId)
        showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      if (workplaceRef.current === requestWorkplaceId) setIsRefreshing(false);
    }
  }, [workplaceId, pageSize, retry]);

  const handleLoadOlder = useCallback(async () => {
    if (isScanningOlder) return;
    const requestWorkplaceId = workplaceId;
    setIsScanningOlder(true);
    analytics.trackFeatureUsage('sms', 'inbox_bulk_sync', { mode: 'scan_older' });
    try {
      const result = await smsService.scanOlderSmsPage(scanCursor, requestWorkplaceId, pageSize);
      if (workplaceRef.current !== requestWorkplaceId) return;
      setScanCursor(result.cursor);
      setHasOlderMessages(result.hasMore);
      loadMore();
    } catch (error) {
      if (workplaceRef.current === requestWorkplaceId)
        showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      if (workplaceRef.current === requestWorkplaceId) setIsScanningOlder(false);
    }
  }, [isScanningOlder, loadMore, pageSize, scanCursor, workplaceId]);

  const handleRepairOldUpiMerchants = useCallback(() => {
    if (isRepairingOldUpiMerchants) return;
    confirm.show({
      title: 'Repair old UPI merchant names?',
      message:
        'This repairs linked SMS merchant details and Suggestions from SMS history in this workspace when the old parser cut a UPI ID at its first period. Amounts and posted journal entries will not change.',
      confirmText: 'Repair names',
      cancelText: 'Cancel',
      onConfirm: () => {
        const requestWorkplaceId = workplaceId;
        setIsRepairingOldUpiMerchants(true);
        void smsService
          .repairLegacyUpiMerchants(requestWorkplaceId)
          .then(count => {
            if (workplaceRef.current !== requestWorkplaceId) return;
            toast.success(
              count
                ? `Repaired ${count} old SMS merchant ${count === 1 ? 'name' : 'names'}`
                : 'No truncated UPI merchant names found',
            );
          })
          .catch(error => {
            if (workplaceRef.current === requestWorkplaceId)
              showErrorAlert(error, 'Repair old SMS merchant names', true);
          })
          .finally(() => {
            if (workplaceRef.current === requestWorkplaceId) setIsRepairingOldUpiMerchants(false);
          });
      },
    });
  }, [isRepairingOldUpiMerchants, workplaceId]);

  return {
    hasOlderMessages,
    isRefreshing,
    isScanningOlder,
    handleRefresh,
    handleLoadOlder,
    handleRepairOldUpiMerchants,
    isRepairingOldUpiMerchants,
    showOldUpiMerchantRepair,
  };
}
