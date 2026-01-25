import { JournalDisplayType } from '@/src/domain/accounting/JournalPresenter';
import { EnrichedJournal } from '@/src/types/readModels';
import React from 'react';
import { BaseTransactionCard } from './BaseTransactionCard';

interface JournalCardProps {
    journal: EnrichedJournal;
    onPress: (journal: EnrichedJournal) => void;
}

/**
 * JournalCard - Displays a journal entry card
 * Uses BaseTransactionCard for consistency and simplicity.
 */
export const JournalCard = ({ journal, onPress }: JournalCardProps) => {
    return (
        <BaseTransactionCard
            title={journal.description || (journal.displayType === JournalDisplayType.TRANSFER ? 'Transfer' : 'Transaction')}
            amount={journal.totalAmount}
            currencyCode={journal.currencyCode}
            transactionDate={journal.journalDate}
            displayType={journal.displayType as JournalDisplayType}
            semanticLabel={journal.semanticLabel}
            semanticType={journal.semanticType}
            accounts={journal.accounts as any}
            onPress={() => onPress(journal)}
        />
    );
};
