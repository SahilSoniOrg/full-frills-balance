import { TransactionInboxItem, WorkplaceId, InboxParseStatus } from '@/src/types/domain';
import { smsService } from '@/src/services/sms-service';
import {
  buildTransactionInboxImportNavigation,
  TransactionInboxImportOptions,
} from '@/src/services/sms/transactionInboxImport';
import type { AccountFields } from '@/src/types/domain';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export type { TransactionInboxImportOptions };

interface UseTransactionInboxImportProps {
  accounts: AccountFields[];
  workplaceId: WorkplaceId;
}

export function useTransactionInboxImport({
  accounts,
  workplaceId,
}: UseTransactionInboxImportProps) {
  return useCallback(
    async (item: TransactionInboxItem, options?: TransactionInboxImportOptions) => {
      let matchedRule: Awaited<ReturnType<typeof smsService.getMatchingRule>> = null;
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
          parseStatus: (item.parseStatus as InboxParseStatus) || InboxParseStatus.PARSED,
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

      const navigation = buildTransactionInboxImportNavigation(
        item,
        accounts,
        matchedRule,
        options,
      );
      AppNavigation.toJournalEntry(navigation);
    },
    [accounts, workplaceId],
  );
}
