import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import SmsInboxRecord, { SmsProcessingStatus } from '@/src/data/models/SmsInboxRecord';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useAccounts } from '@/src/features/accounts';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { smsService } from '@/src/services/sms-service';
import { AccountId, JournalId, SmsDuplicateCandidate, SmsInboxItem } from '@/src/types/domain';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { AppConfig } from '@/src/constants/app-config';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type InboxFilter = 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';

const PAGE_SIZE = 25;

function normalizeForMatch(value?: string) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface SmsInboxViewModel {
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  items: SmsInboxItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isRefreshing: boolean;
  isScanningOlder: boolean;
  handleRefresh: () => Promise<void>;
  handleLoadOlder: () => Promise<void>;
  handleDismiss: (item: SmsInboxItem) => Promise<void>;
  handleUndismiss: (item: SmsInboxItem) => Promise<void>;
  handleImport: (item: SmsInboxItem) => void;
  handleCompareDuplicate: (item: SmsInboxItem) => void;
  handleOpenJournal: (item: SmsInboxItem) => void;
  filterButtons: { key: InboxFilter; label: string }[];
  defaultCurrencyCode: string;
}

export function useSmsInboxViewModel(): SmsInboxViewModel {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);

  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [scanCursor, setScanCursor] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanningOlder, setIsScanningOlder] = useState(false);

  const observe = useCallback(
    (limit: number) => smsService.observeInbox(workplaceId, limit, { status: filter }),
    [filter, workplaceId],
  );

  const enrich = useCallback(
    async (records: SmsInboxRecord[]) => {
      const linkedIds = Array.from(
        new Set(records.map(record => record.linkedJournalId).filter(Boolean) as JournalId[]),
      );
      const duplicateIds = Array.from(
        new Set(records.map(record => record.duplicateJournalId).filter(Boolean) as JournalId[]),
      );
      const journals = await journalRepository.findByIds(
        workplaceId,
        Array.from(new Set([...linkedIds, ...duplicateIds])),
      );
      const journalMap = new Map(journals.map(journal => [journal.id, journal]));

      return records.map((record): SmsInboxItem => {
        const metadata = record.metadataJson ? JSON.parse(record.metadataJson) : {};
        const duplicateCandidate: SmsDuplicateCandidate | undefined = record.duplicateJournalId
          ? {
              journalId: record.duplicateJournalId,
              journalDate: journalMap.get(record.duplicateJournalId)?.journalDate || record.smsDate,
              description: journalMap.get(record.duplicateJournalId)?.description,
              score: record.duplicateConfidence || 0,
              reasons: Array.isArray(metadata.duplicateReasons) ? metadata.duplicateReasons : [],
            }
          : undefined;

        return {
          id: record.id,
          deviceSmsId: record.deviceSmsId,
          senderAddress: record.senderAddress,
          rawBody: record.rawBody,
          smsDate: record.smsDate,
          parseStatus: record.parseStatus,
          processingStatus: record.processingStatus,
          parsedAmount: record.parsedAmount,
          parsedCurrencyCode: record.parsedCurrencyCode,
          parsedMerchant: record.parsedMerchant,
          parsedAccountSource: record.parsedAccountSource,
          referenceNumber: record.referenceNumber,
          direction: record.direction,
          parseConfidence: record.parseConfidence,
          parseReason: record.parseReason,
          linkedJournal: record.linkedJournalId
            ? {
                journalId: record.linkedJournalId,
                description: journalMap.get(record.linkedJournalId)?.description,
                journalDate: journalMap.get(record.linkedJournalId)?.journalDate || record.smsDate,
                status: journalMap.get(record.linkedJournalId)?.status || 'POSTED',
              }
            : undefined,
          duplicateCandidate,
        };
      });
    },
    [workplaceId],
  );

  const { items, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<
    SmsInboxRecord,
    SmsInboxItem
  >({
    pageSize: PAGE_SIZE,
    observe,
    enrich,
  });

  useEffect(() => {
    let isMounted = true;
    const prime = async () => {
      try {
        const result = await smsService.scanRecentSmsPage(workplaceId, PAGE_SIZE * 2);
        if (isMounted) {
          setScanCursor(result.cursor);
        }
      } catch (error) {
        showErrorAlert(error, 'SMS Inbox', true);
      }
    };
    prime();
    return () => {
      isMounted = false;
    };
  }, [workplaceId]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await smsService.refreshLatestSms(workplaceId, PAGE_SIZE * 2);
      setScanCursor(result.cursor);
      toast.success('SMS inbox refreshed');
    } catch (error) {
      showErrorAlert(error, 'SMS Inbox', true);
    } finally {
      setIsRefreshing(false);
    }
  }, [workplaceId]);

  const handleLoadOlder = useCallback(async () => {
    if (isScanningOlder) return;
    setIsScanningOlder(true);
    try {
      const result = await smsService.scanOlderSmsPage(scanCursor, workplaceId, PAGE_SIZE);
      setScanCursor(result.cursor);
      loadMore();
    } catch (error) {
      showErrorAlert(error, 'SMS Inbox', true);
    } finally {
      setIsScanningOlder(false);
    }
  }, [isScanningOlder, loadMore, scanCursor, workplaceId]);

  const handleDismiss = useCallback(async (item: SmsInboxItem) => {
    await smsService.markInboxRecordStatus(item.id, SmsProcessingStatus.DISMISSED);
    await smsService.markSmsAsProcessed(item.deviceSmsId);
  }, []);

  const handleUndismiss = useCallback(async (item: SmsInboxItem) => {
    await smsService.markInboxRecordStatus(
      item.id,
      item.duplicateCandidate ? SmsProcessingStatus.DUPLICATE_FLAGGED : SmsProcessingStatus.PENDING,
    );
  }, []);

  const handleImport = useCallback(
    (item: SmsInboxItem) => {
      let matchedBankAccountId: AccountId | undefined;
      let matchedCounterpartyId: string | undefined;

      if (item.parsedAccountSource) {
        const normalizedSource = normalizeForMatch(item.parsedAccountSource);
        const sourceDigits = item.parsedAccountSource.match(/(\d{3,6})/)?.[1];
        const bestAccount = accounts.find(account => {
          const name = normalizeForMatch(account.name);
          const description = normalizeForMatch(account.description);
          if (
            sourceDigits &&
            ((account.name || '').includes(sourceDigits) ||
              (account.description || '').includes(sourceDigits))
          ) {
            return true;
          }
          return name.includes(normalizedSource) || description.includes(normalizedSource);
        });
        matchedBankAccountId = bestAccount?.id;
      }

      if (item.parsedMerchant) {
        const normalizedMerchant = normalizeForMatch(item.parsedMerchant);
        const bestAccount = accounts.find(account => {
          const name = normalizeForMatch(account.name);
          return name.includes(normalizedMerchant) || normalizedMerchant.includes(name);
        });
        if (bestAccount && bestAccount.id !== matchedBankAccountId) {
          matchedCounterpartyId = bestAccount.id;
        }
      }

      let type: 'expense' | 'income' | 'transfer' =
        item.direction === 'credit' ? 'income' : 'expense';
      if (matchedBankAccountId && matchedCounterpartyId) {
        type = 'transfer';
      }

      const params: Record<string, string> = {
        type,
        amount: String(item.parsedAmount || ''),
        notes: `Imported from: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\\nRef: ${item.referenceNumber}` : ''}\\n\\n${item.rawBody.substring(0, AppConfig.input.sms.previewBodyChars)}...`,
      };

      if (item.direction === 'debit') {
        if (matchedBankAccountId) params.sourceAccountId = matchedBankAccountId;
        if (matchedCounterpartyId) params.destinationAccountId = matchedCounterpartyId;
      } else {
        if (matchedCounterpartyId) params.sourceAccountId = matchedCounterpartyId;
        if (matchedBankAccountId) params.destinationAccountId = matchedBankAccountId;
      }

      AppNavigation.toJournalEntry({
        smsId: item.deviceSmsId,
        smsRecordId: item.id,
        smsSender: item.senderAddress,
        rawSmsBody: item.rawBody,
        initialDate: new Date(item.smsDate).toISOString(),
        params,
      });
    },
    [accounts],
  );

  const handleCompareDuplicate = useCallback(
    (item: SmsInboxItem) => {
      if (!item.duplicateCandidate) return;
      AppNavigation.toTransactionDetails(item.duplicateCandidate.journalId, {
        title: item.duplicateCandidate.description || item.parsedMerchant || item.senderAddress,
        amount: item.parsedAmount || 0,
        currencyCode: item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.duplicateCandidate.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

  const handleOpenJournal = useCallback(
    (item: SmsInboxItem) => {
      if (!item.linkedJournal) return;
      AppNavigation.toTransactionDetails(item.linkedJournal.journalId, {
        title: item.linkedJournal.description || item.parsedMerchant || item.senderAddress,
        amount: item.parsedAmount || 0,
        currencyCode: item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.linkedJournal.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

  const filterButtons = useMemo(
    () => [
      { key: 'pending' as InboxFilter, label: 'Pending' },
      { key: 'processed' as InboxFilter, label: 'Processed' },
      { key: 'auto_posted' as InboxFilter, label: 'Auto-Posted' },
      { key: 'duplicates' as InboxFilter, label: 'Duplicates' },
      { key: 'failed' as InboxFilter, label: 'Failed' },
    ],
    [],
  );

  return {
    filter,
    setFilter,
    items,
    isLoading,
    isLoadingMore,
    hasMore,
    isRefreshing,
    isScanningOlder,
    handleRefresh,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleCompareDuplicate,
    handleOpenJournal,
    filterButtons,
    defaultCurrencyCode,
  };
}
