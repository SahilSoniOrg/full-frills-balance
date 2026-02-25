import { TransactionCard } from '@/src/components/common/TransactionCard';
import { EnrichedJournal } from '@/src/types/domain';
import React, { useMemo } from 'react';
import { mapJournalToCardProps } from '../utils/journalUiUtils';

export interface JournalCardProps {
    journal: EnrichedJournal;
    onPress?: () => void;
}

/**
 * JournalCard - Feature-specific wrapper for TransactionCard that maps EnrichedJournal data
 */
export const JournalCard = ({ journal, onPress }: JournalCardProps) => {
    const cardProps = useMemo(() => mapJournalToCardProps(journal), [journal]);

    return (
        <TransactionCard
            {...cardProps}
            onPress={onPress}
        />
    );
};
