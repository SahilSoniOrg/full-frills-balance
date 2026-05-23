import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useAccounts } from '@/src/features/accounts';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { smsService } from '@/src/services/sms-service';
import {
  AccountId,
  JournalId,
  TransactionDuplicateCandidate,
  TransactionInboxItem,
} from '@/src/types/domain';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { AppConfig } from '@/src/constants/app-config';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type InboxFilter = 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';

const PAGE_SIZE = 25;

function normalizeForMatch(value?: string) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface TransactionInboxViewModel {
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  items: TransactionInboxItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isRefreshing: boolean;
  isScanningOlder: boolean;
  handleRefresh: () => Promise<void>;
  handleLoadOlder: () => Promise<void>;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  handleCompareDuplicate: (item: TransactionInboxItem) => void;
  handleOpenJournal: (item: TransactionInboxItem) => void;
  filterButtons: { key: InboxFilter; label: string }[];
  defaultCurrencyCode: string;
}

export function useTransactionInboxViewModel(): TransactionInboxViewModel {
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
    async (records: TransactionInboxRecord[]) => {
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

      return records.map((record): TransactionInboxItem => {
        const metadata = record.metadataJson ? JSON.parse(record.metadataJson) : {};
        const duplicateCandidate: TransactionDuplicateCandidate | undefined =
          record.duplicateJournalId
            ? {
                journalId: record.duplicateJournalId,
                journalDate:
                  journalMap.get(record.duplicateJournalId)?.journalDate || record.inputDate,
                description: journalMap.get(record.duplicateJournalId)?.description,
                score: record.duplicateConfidence || 0,
                reasons: Array.isArray(metadata.duplicateReasons) ? metadata.duplicateReasons : [],
              }
            : undefined;

        return {
          id: record.id,
          channel: record.channel,
          deviceSourceId: record.deviceSourceId,
          senderAddress: record.senderAddress || '',
          rawBody: record.rawBody || '',
          inputDate: record.inputDate,
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
                journalDate:
                  journalMap.get(record.linkedJournalId)?.journalDate || record.inputDate,
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
    TransactionInboxRecord,
    TransactionInboxItem
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
        showErrorAlert(error, 'Transaction Inbox', true);
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
      toast.success('Transaction inbox refreshed');
    } catch (error) {
      showErrorAlert(error, 'Transaction Inbox', true);
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
      showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      setIsScanningOlder(false);
    }
  }, [isScanningOlder, loadMore, scanCursor, workplaceId]);

  const handleDismiss = useCallback(async (item: TransactionInboxItem) => {
    await smsService.markInboxRecordStatus(item.id, InboxProcessingStatus.DISMISSED);
    if (item.channel === 'sms') {
      await smsService.markSmsAsProcessed(item.deviceSourceId);
    }
  }, []);

  const handleUndismiss = useCallback(async (item: TransactionInboxItem) => {
    await smsService.markInboxRecordStatus(
      item.id,
      item.duplicateCandidate
        ? InboxProcessingStatus.DUPLICATE_FLAGGED
        : InboxProcessingStatus.PENDING,
    );
  }, []);

  const handleImport = useCallback(
    (item: TransactionInboxItem) => {
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

      let notesText = '';
      if (item.channel === 'voice') {
        notesText = `Spoken transcript: ${item.rawBody}`;
      } else if (item.channel === 'sms') {
        notesText = `Imported from SMS: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\\nRef: ${item.referenceNumber}` : ''}\\n\\n${(item.rawBody || '').substring(0, AppConfig.input.sms.previewBodyChars)}...`;
      } else {
        notesText = `Imported from ${item.channel}: ${item.parsedMerchant || item.senderAddress}\\n\\n${(item.rawBody || '').substring(0, 100)}...`;
      }

      const params: Record<string, string> = {
        type,
        amount: String(item.parsedAmount || ''),
        notes: notesText,
      };

      if (item.direction === 'debit') {
        if (matchedBankAccountId) params.sourceAccountId = matchedBankAccountId;
        if (matchedCounterpartyId) params.destinationAccountId = matchedCounterpartyId;
      } else {
        if (matchedCounterpartyId) params.sourceAccountId = matchedCounterpartyId;
        if (matchedBankAccountId) params.destinationAccountId = matchedBankAccountId;
      }

      AppNavigation.toJournalEntry({
        smsId: item.channel === 'sms' ? item.deviceSourceId : undefined,
        smsRecordId: item.id,
        smsSender: item.senderAddress,
        rawSmsBody: item.rawBody,
        initialDate: new Date(item.inputDate).toISOString(),
        params,
      });
    },
    [accounts],
  );

  const handleCompareDuplicate = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.duplicateCandidate) return;
      AppNavigation.toTransactionDetails(item.duplicateCandidate.journalId, {
        title:
          item.duplicateCandidate.description || item.parsedMerchant || item.senderAddress || '',
        amount: item.parsedAmount || 0,
        currencyCode: item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.duplicateCandidate.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

  const handleOpenJournal = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.linkedJournal) return;
      AppNavigation.toTransactionDetails(item.linkedJournal.journalId, {
        title: item.linkedJournal.description || item.parsedMerchant || item.senderAddress || '',
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
