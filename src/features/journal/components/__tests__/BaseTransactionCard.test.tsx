import { BaseTransactionCard, BaseTransactionCardProps } from '@/src/features/journal/components/BaseTransactionCard';
import { JournalDisplayType } from '@/src/services/accounting/JournalPresenter';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

const mockProps: BaseTransactionCardProps = {
    title: 'Grocery Shopping',
    amount: 50.25,
    currencyCode: 'USD',
    transactionDate: new Date('2024-01-15T10:30:00'),
    displayType: JournalDisplayType.EXPENSE,
    accounts: [
        {
            id: '1',
            name: 'Cash',
            accountType: 'ASSET',
            role: 'SOURCE',
        },
        {
            id: '2',
            name: 'Groceries',
            accountType: 'EXPENSE',
            role: 'DESTINATION',
        },
    ],
    notes: 'Weekly shopping',
};

describe('BaseTransactionCard', () => {
    it('renders title and amount', () => {
        render(<BaseTransactionCard {...mockProps} />);
        expect(screen.getByText('Grocery Shopping')).toBeTruthy();
        expect(screen.getByText(/50\.25/)).toBeTruthy();
    });

    it('renders account badges', () => {
        render(<BaseTransactionCard {...mockProps} />);
        expect(screen.getByText(/From: Cash/)).toBeTruthy();
        expect(screen.getByText(/To: Groceries/)).toBeTruthy();
    });

    it('renders notes when provided', () => {
        render(<BaseTransactionCard {...mockProps} />);
        expect(screen.getByText('Weekly shopping')).toBeTruthy();
    });

    it('handles onPress events', () => {
        const onPressMock = jest.fn();
        render(<BaseTransactionCard {...mockProps} onPress={onPressMock} />);

        // Find and press the card (it's wrapped in TouchableOpacity when onPress is provided)
        const card = screen.getByText('Grocery Shopping').parent?.parent?.parent;
        if (card) {
            fireEvent.press(card);
            expect(onPressMock).toHaveBeenCalledTimes(1);
        }
    });

    it('shows income indicator for income transactions', () => {
        render(<BaseTransactionCard {...mockProps} displayType={JournalDisplayType.INCOME} />);
        expect(screen.getByText(/\+ /)).toBeTruthy();
    });

    it('shows expense indicator for expense transactions', () => {
        render(<BaseTransactionCard {...mockProps} displayType={JournalDisplayType.EXPENSE} />);
        expect(screen.getByText(/− /)).toBeTruthy();
    });
});
