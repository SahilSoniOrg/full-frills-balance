import { InboxParseStatus } from '@/src/data/models/TransactionInboxRecord';
import Account from '@/src/data/models/Account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionInboxItem, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { AppConfig } from '@/src/constants/app-config';
import { useCallback } from 'react';

interface UseTransactionInboxImportProps {
  accounts: Account[];
  workplaceId: WorkplaceId;
}

function normalizeForMatch(value?: string) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function useTransactionInboxImport({
  accounts,
  workplaceId,
}: UseTransactionInboxImportProps) {
  return useCallback(
    async (item: TransactionInboxItem) => {
      let matchedBankAccountId: AccountId | undefined;
      let matchedCounterpartyId: string | undefined;
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
            // Ignore malformed optional rule actions.
          }
        }
      }

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

      const type: 'expense' | 'income' | 'transfer' =
        matchedBankAccountId && matchedCounterpartyId
          ? 'transfer'
          : item.direction === 'credit'
            ? 'income'
            : 'expense';

      let notesText = '';
      if (customDescription?.trim()) {
        notesText = customDescription
          .trim()
          .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
          .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
          .replace(/{ref}/gi, item.referenceNumber || '')
          .replace(/{sender}/gi, item.senderAddress || '')
          .replace(/\\n/g, '\n');
      } else if (item.channel === 'voice') {
        notesText = `Spoken transcript: ${item.rawBody}`;
      } else if (item.channel === 'sms') {
        notesText = `Imported from SMS: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\nRef: ${item.referenceNumber}` : ''}\n\n${(item.rawBody || '').substring(0, AppConfig.input.sms.previewBodyChars)}...`;
      } else {
        notesText = `Imported from ${item.channel}: ${item.parsedMerchant || item.senderAddress}\n\n${(item.rawBody || '').substring(0, 100)}...`;
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
}
