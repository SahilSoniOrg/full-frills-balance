import { JournalCalculator, JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { sanitizeAmount } from '@/src/utils/validation';
import { useMemo } from 'react';

interface AdvancedJournalLineLike {
    amount: number | string;
    exchangeRate?: number | string | null;
    transactionType: JournalLineInput['type'];
}

export function useAdvancedJournalSummary(lines: AdvancedJournalLineLike[]) {
    const domainLines = useMemo<JournalLineInput[]>(() => {
        return lines.map((line) => {
            const rawAmount = sanitizeAmount(line.amount) || 0;
            const rawRate = typeof line.exchangeRate === 'string' ? parseFloat(line.exchangeRate) : line.exchangeRate;
            const effectiveRate = rawRate && rawRate > 0 ? rawRate : 1;
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
