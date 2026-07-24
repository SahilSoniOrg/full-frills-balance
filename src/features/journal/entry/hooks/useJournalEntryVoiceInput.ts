import Account, { AccountType } from '@/src/data/models/Account';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { AccountId, TransactionType } from '@/src/types/domain';
import { useCallback, useState } from 'react';

export interface UseJournalEntryVoiceInputOptions {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>;
}

export function useJournalEntryVoiceInput(options: UseJournalEntryVoiceInputOptions) {
  const { accounts, editor, simpleEditor } = options;

  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);

  const handleApplyVoiceInput = useCallback(
    (params: {
      amount?: number;
      merchantName?: string;
      direction: 'debit' | 'credit' | 'unknown';
      transactionType?: 'expense' | 'income' | 'transfer';
      sourceAccountId: AccountId;
      categoryAccountId: AccountId;
      transcription: string;
    }) => {
      const {
        amount,
        merchantName,
        direction,
        transactionType,
        sourceAccountId,
        categoryAccountId,
        transcription,
      } = params;

      if (merchantName) {
        editor.setDescription(merchantName);
      }
      if (transcription) {
        editor.setNotes(`Spoken transcript: ${transcription}`);
      }

      const mappedType = transactionType || (direction === 'credit' ? 'income' : 'expense');

      if (editor.isGuidedMode) {
        simpleEditor.setType(mappedType);

        if (amount) {
          simpleEditor.setAmount(String(amount));
        }

        if (mappedType === 'income') {
          if (categoryAccountId) {
            simpleEditor.setSourceId(categoryAccountId);
          }
          if (sourceAccountId) {
            simpleEditor.setDestinationId(sourceAccountId);
          }
        } else {
          if (sourceAccountId) {
            simpleEditor.setSourceId(sourceAccountId);
          }
          if (categoryAccountId) {
            simpleEditor.setDestinationId(categoryAccountId);
          }
        }
      } else {
        editor.setTransactionType(mappedType);
        editor.setLines(prev =>
          prev.map(line => {
            const isDebit = line.transactionType === TransactionType.DEBIT;

            const lineAccountId =
              mappedType === 'income'
                ? isDebit
                  ? sourceAccountId
                  : categoryAccountId
                : isDebit
                  ? categoryAccountId
                  : sourceAccountId;

            const account = accounts.find(a => a.id === lineAccountId);

            return {
              ...line,
              accountId: lineAccountId,
              accountName: account?.name || '',
              accountType: account?.accountType || AccountType.ASSET,
              accountCurrency: account?.currencyCode,
              amount: amount ? String(amount) : line.amount,
            };
          }),
        );
      }
    },
    [editor, simpleEditor, accounts],
  );

  return {
    isVoiceModalVisible,
    setIsVoiceModalVisible,
    handleApplyVoiceInput,
  };
}
