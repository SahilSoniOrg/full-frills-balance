import { TransactionInboxItem, WorkplaceId } from '@/src/types/domain';
import { smsService } from '@/src/services/sms-service';
import { buildTransactionInboxImportNavigation } from '@/src/services/sms/transactionInboxImport';
import Account from '@/src/data/models/Account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { InboxParseStatus } from '@/src/data/models/TransactionInboxRecord';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

interface UseTransactionInboxImportProps {
  accounts: Account[];
  workplaceId: WorkplaceId;
}

export function useTransactionInboxImport({
  accounts,
  workplaceId,
}: UseTransactionInboxImportProps) {
  return useCallback(
    async (item: TransactionInboxItem) => {
      let matchedRule: TransactionAutoPostRule | null = null;
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
        logger.error('Failed to search matching rules in handleImport', { error });
      }

      AppNavigation.toJournalEntry(
        buildTransactionInboxImportNavigation(item, accounts, matchedRule),
      );
    },
    [accounts, workplaceId],
  );
}
