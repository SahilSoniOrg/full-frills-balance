import { useMemo } from 'react';
import { JournalLineInput, JournalCalculator } from '@/src/services/accounting/JournalCalculator';

interface AdvancedJournalLineLike {
    amount: number | string;
    exchangeRate?: number | null;
    transactionType: JournalLineInput['type'];
}

export function useAdvancedJournalSummary(lines: AdvancedJournalLineLike[]) {
    const domainLines = useMemo<JournalLineInput[]>(() => {
        return lines.map((line) => {
            const rawAmount = typeof line.amount === 'string' ? parseFloat(line.amount) || 0 : line.amount;
            const effectiveRate = line.exchangeRate || 1;
            return {
                amount: rawAmount * effectiveRate,
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
