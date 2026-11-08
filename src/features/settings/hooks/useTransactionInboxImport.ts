import { TransactionInboxItem } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';
import {
  prepareTransactionInboxImport,
  type TransactionInboxImportOptions,
} from '@/src/services/sms/transactionInboxImport';
import type { AccountFields } from '@/src/types/plainDtos';
import type { SmsAccountRecognition } from '@/src/types/accountMatcher';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { accountMatcherStrings } from '@/src/constants/copy/domains/accountMatcherStrings';
import { alert } from '@/src/utils/alerts';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { readEmailRecognitionEvidence } from '@/src/services/email/emailRecognitionEvidence';

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
      let recognition: SmsAccountRecognition = {
        status: 'indeterminate',
        accountIds: [],
        outcomes: [],
      };
      try {
        if (item.channel === 'sms') {
          const matcherContext = await loadAccountMatcherContext(workplaceId);
          recognition = recognizeSmsAccounts(matcherContext, {
            senderAddress: item.senderAddress || '',
            rawBody: item.rawBody || '',
          });
        } else if (item.channel === 'email') {
          const [matcherContext, inboxRecord] = await Promise.all([
            loadAccountMatcherContext(workplaceId),
            transactionInboxRepository.findEmail(workplaceId, item.id),
          ]);
          recognition = readEmailRecognitionEvidence(inboxRecord?.metadataJson, matcherContext) ?? {
            status: 'none',
            accountIds: [],
            outcomes: [],
          };
        } else {
          // Voice records retain manual import without text recognition.
          recognition = { status: 'none', accountIds: [], outcomes: [] };
        }
      } catch (error) {
        logger.error('Failed to recognize accounts for inbox import', { error });
        // An incomplete recognition result must not fall through to fuzzy source matching.
        recognition = { status: 'indeterminate', accountIds: [], outcomes: [] };
      }

      const prepared = prepareTransactionInboxImport(item, accounts, {
        ...options,
        recognition,
      });
      const recognitionSummary = prepared.recognition;
      if (recognitionSummary?.hold || recognitionSummary?.status === 'indeterminate') {
        alert.show({
          title: accountMatcherStrings.importConflictTitle,
          message: accountMatcherStrings.importConflictUnconfirmed,
          type: 'warning',
          onAction: () => AppNavigation.toJournalEntry(prepared.navigation),
        });
      } else {
        AppNavigation.toJournalEntry(prepared.navigation);
      }
    },
    [accounts, workplaceId],
  );
}
