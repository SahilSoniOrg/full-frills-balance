import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import TransactionInboxRecord, {
  InboxParseStatus,
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { useAccounts } from '@/src/features/accounts';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionInboxItem } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
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
    (records: TransactionInboxRecord[]) => enrichTransactionInboxRecords(workplaceId, records),
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
    async (item: TransactionInboxItem) => {
      let matchedBankAccountId: AccountId | undefined;
      let matchedCounterpartyId: string | undefined;

      // 1. Try to find a matching rule to pre-fill accounts
      let matchedRule: any = null;
      try {
        const parsedTx: ParsedTransaction = {
          id: item.deviceSourceId,
          amount: item.parsedAmount,
          merchant: item.parsedMerchant,
          type:
            item.direction === 'credit'
              ? 'credit'
              : item.direction === 'debit'
                ? 'debit'
                : 'unknown',
          date: item.inputDate,
          rawBody: item.rawBody || '',
          address: item.senderAddress || '',
          accountSource: item.parsedAccountSource,
          confidence: item.parseConfidence ?? 0,
          parseStatus: item.parseStatus as InboxParseStatus,
          parseReason: item.parseReason || '',
        };
        matchedRule = await smsService.getMatchingRule(
          item.senderAddress || '',
          item.rawBody || '',
          parsedTx,
          workplaceId,
        );
      } catch (error) {
        logger.error('Failed to search matching rules in handleImport', error);
      }

      let customDescription: string | undefined;
      if (matchedRule) {
        if (matchedRule.sourceAccountId && matchedRule.sourceAccountId !== EMPTY_ACCOUNT_ID) {
          matchedBankAccountId = matchedRule.sourceAccountId;
        }
        if (matchedRule.categoryAccountId && matchedRule.categoryAccountId !== EMPTY_ACCOUNT_ID) {
          matchedCounterpartyId = matchedRule.categoryAccountId;
        }
        if (matchedRule.actionsJson) {
          try {
            const actions = JSON.parse(matchedRule.actionsJson);
            if (actions && typeof actions === 'object' && actions.journalDescription) {
              customDescription = actions.journalDescription;
            }
          } catch {
            // ignore
          }
        }
      }

      // 2. Fall back to heuristics if rule didn't pre-fill
      if (!matchedBankAccountId && item.parsedAccountSource) {
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

      if (!matchedCounterpartyId && item.parsedMerchant) {
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
      if (customDescription?.trim()) {
        notesText = customDescription
          .trim()
          .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
          .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
          .replace(/{ref}/gi, item.referenceNumber || '')
          .replace(/{sender}/gi, item.senderAddress || '')
          .replace(/\\n/g, '\n');
      } else {
        if (item.channel === 'voice') {
          notesText = `Spoken transcript: ${item.rawBody}`;
        } else if (item.channel === 'sms') {
          notesText = `Imported from SMS: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\nRef: ${item.referenceNumber}` : ''}\n\n${(item.rawBody || '').substring(0, AppConfig.input.sms.previewBodyChars)}...`;
        } else {
          notesText = `Imported from ${item.channel}: ${item.parsedMerchant || item.senderAddress}\n\n${(item.rawBody || '').substring(0, 100)}...`;
        }
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
    [accounts, workplaceId],
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
