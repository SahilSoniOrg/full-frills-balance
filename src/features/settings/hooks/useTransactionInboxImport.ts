import { TransactionInboxItem } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';
import { InboxParseStatus } from '@/src/types/enums';
import { smsService } from '@/src/services/sms-service';
import {
  prepareTransactionInboxImport,
  TransactionInboxImportOptions,
} from '@/src/services/sms/transactionInboxImport';
import type { AccountFields } from '@/src/types/plainDtos';
import type { SmsAccountRecognition } from '@/src/types/accountMatcher';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { accountMatcherStrings } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { alert } from '@/src/utils/alerts';

interface UseTransactionInboxImportProps {
  accounts: AccountFields[];
  workplaceId: WorkplaceId;
}

export function useTransactionInboxImport({
  accounts,
  workplaceId,
}: UseTransactionInboxImportProps) {
  const privateMode = useEffectivePrivacyMode();
  return useCallback(
    async (item: TransactionInboxItem, options?: TransactionInboxImportOptions) => {
      let matchedRule: Awaited<ReturnType<typeof smsService.getMatchingRule>> = null;
      let recognition: SmsAccountRecognition | undefined;
      try {
        const parsedTx: ParsedTransaction = {
          id: item.deviceSourceId,
          amount: item.parsedAmount,
          merchant: item.parsedMerchant,
          type: item.direction ?? 'unknown',
          date: item.inputDate,
          rawBody: item.rawBody || '',
          address: item.senderAddress || '',
          accountSource: item.parsedAccountSource,
          currencyCode: item.parsedCurrencyCode,
          referenceNumber: item.referenceNumber,
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
        const matcherContext = await loadAccountMatcherContext(workplaceId);
        recognition = recognizeSmsAccounts(matcherContext, {
          senderAddress: item.senderAddress || '',
          rawBody: item.rawBody || '',
        });
      } catch (error) {
        logger.error('Failed to search matching rules in handleImport', { error });
        // An incomplete recognition result must not fall through to fuzzy source matching.
        recognition = { status: 'indeterminate', accountIds: [], outcomes: [] };
      }

      const prepared = prepareTransactionInboxImport(item, accounts, matchedRule, {
        ...options,
        recognition,
      });
      const recognitionSummary = prepared.recognition;
      if (recognitionSummary?.hold || recognitionSummary?.status === 'indeterminate') {
        const ruleAccount = accounts.find(account => account.id === matchedRule?.sourceAccountId);
        const recognized = accounts.filter(account =>
          recognitionSummary.accountIds.includes(account.id),
        );
        const message =
          recognitionSummary.hold === 'contradictory' && !privateMode
            ? accountMatcherStrings.importConflictDetail(
                ruleAccount?.name,
                recognized.map(account => account.name),
              )
            : accountMatcherStrings.importConflictUnconfirmed;
        alert.show({
          title: accountMatcherStrings.importConflictTitle,
          message,
          type: 'warning',
          onAction: () => AppNavigation.toJournalEntry(prepared.navigation),
        });
      } else {
        AppNavigation.toJournalEntry(prepared.navigation);
      }
    },
    [accounts, workplaceId, privateMode],
  );
}
