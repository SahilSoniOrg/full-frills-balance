import { EnrichedTransaction } from '@/src/types/readModels';
import React from 'react';
import { BaseTransactionCard } from './BaseTransactionCard';

interface TransactionItemProps {
    transaction: EnrichedTransaction;
    onPress?: (transaction: EnrichedTransaction) => void;
}

/**
 * TransactionItem - Premium card component for individual transaction legs
 * Uses BaseTransactionCard for a unified IvyWallet aesthetic.
 */
export const TransactionItem = ({ transaction, onPress }: TransactionItemProps) => {
    // Collect accounts for the card header badges
    const displayAccounts = [
        {
            id: transaction.accountId,
            name: transaction.accountName || 'Unknown',
            accountType: transaction.accountType || 'ASSET'
        }
    ];

    if (transaction.counterAccountType) {
        // Categories/Counter-accounts are shown first
        displayAccounts.unshift({
            id: 'counter',
            name: transaction.counterAccountName || transaction.counterAccountType,
            accountType: transaction.counterAccountType
        });
    }

    return (
        <BaseTransactionCard
            title={transaction.journalDescription || transaction.displayTitle || 'Transaction'}
            amount={transaction.amount}
            currencyCode={transaction.currencyCode}
            transactionDate={transaction.transactionDate}
            displayType={transaction.displayType}
            accounts={displayAccounts}
            notes={transaction.notes}
            isIncrease={transaction.isIncrease}
            onPress={onPress ? () => onPress(transaction) : undefined}
        />
    );
};
