import { BaseTransactionCard } from '@/src/features/journal/components/BaseTransactionCard';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import React from 'react';

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
