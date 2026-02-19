import { JournalCalculator, JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { useMemo } from 'react';

interface AdvancedJournalLineLike {
    amount: number | string;
    exchangeRate?: number | string | null;
    transactionType: JournalLineInput['type'];
}

export function useAdvancedJournalSummary(lines: AdvancedJournalLineLike[]) {
    const domainLines = useMemo<JournalLineInput[]>(() => {
        return lines.map((line) => {
            const rawRate = typeof line.exchangeRate === 'string' ? parseFloat(line.exchangeRate) : line.exchangeRate;

            // Use canonical calculation from JournalCalculator to ensure summary matches line display
            const amount = JournalCalculator.getLineBaseAmount({
                amount: line.amount,
                exchangeRate: rawRate || 1,
                // We pass accountCurrency to trigger the exchangeRate logic if the line isn't in base currency
                accountCurrency: 'EXTERNAL'
            });

            return {
                amount,
                type: line.transactionType,
            };
        });
    }, [lines]);

    const totalDebits = useMemo(() => JournalCalculator.calculateTotalDebits(domainLines), [domainLines]);
    const totalCredits = useMemo(() => JournalCalculator.calculateTotalCredits(domainLines), [domainLines]);
    const isBalanced = useMemo(() => JournalCalculator.isBalanced(domainLines), [domainLines]);

    return {
        totalDebits,
        totalCredits,
        isBalanced,
    };
}
