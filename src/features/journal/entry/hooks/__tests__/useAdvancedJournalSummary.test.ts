import { TransactionType } from '@/src/data/models/Transaction';
import { act, renderHook } from '@testing-library/react-native';
import { useAdvancedJournalSummary } from '../useAdvancedJournalSummary';

// Mock dependencies
jest.mock('@/src/hooks/use-theme', () => ({
    useTheme: () => ({ theme: {} })
}));

jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        defaultCurrencyCode: 'USD'
    }
}));

jest.mock('@/src/constants', () => ({
    AppConfig: {
        defaultCurrency: 'USD'
    }
}));

describe('useAdvancedJournalSummary', () => {
    const defaultLines = [
        { amount: '100', transactionType: TransactionType.DEBIT as const, accountCurrency: 'USD' },
        { amount: '100', transactionType: TransactionType.CREDIT as const, accountCurrency: 'USD' }
    ];

    it('identifies unique currencies', () => {
        const lines = [
            { amount: '100', transactionType: TransactionType.DEBIT as const, accountCurrency: 'USD' },
            { amount: '85', transactionType: TransactionType.CREDIT as const, accountCurrency: 'EUR' }
        ];
        const { result } = renderHook(() => useAdvancedJournalSummary(lines));

        expect(result.current.availableCurrencies).toContain('USD');
        expect(result.current.availableCurrencies).toContain('EUR');
    });

    it('calculates balanced status in selected currency', () => {
        const lines = [
            { amount: '100', transactionType: TransactionType.DEBIT as const, accountCurrency: 'USD' },
            { amount: '100', transactionType: TransactionType.CREDIT as const, accountCurrency: 'USD' }
        ];
        const { result } = renderHook(() => useAdvancedJournalSummary(lines));

        expect(result.current.totalDebits).toBe(100);
        expect(result.current.totalCredits).toBe(100);
        expect(result.current.isBalanced).toBe(true);
    });

    it('handles currency switching', () => {
        const lines = [
            { amount: '100', transactionType: TransactionType.DEBIT as const, accountCurrency: 'USD', exchangeRate: 1 },
            { amount: '80', transactionType: TransactionType.CREDIT as const, accountCurrency: 'EUR', exchangeRate: 1.25 }
        ];
        const { result } = renderHook(() => useAdvancedJournalSummary(lines));

        // Default should be first line currency: USD
        expect(result.current.selectedCurrency).toBe('USD');
        expect(result.current.totalDebits).toBe(100);

        // 80 EUR * 1.25 = 100 USD
        expect(result.current.totalCredits).toBe(100);
        expect(result.current.isBalanced).toBe(true);

        // Switch to EUR
        act(() => {
            result.current.setSelectedCurrency('EUR');
        });

        expect(result.current.selectedCurrency).toBe('EUR');
        // 100 USD / 1.25 = 80 EUR
        expect(result.current.totalDebits).toBe(80);
        expect(result.current.totalCredits).toBe(80);
        expect(result.current.isBalanced).toBe(true);
    });

    it('keeps canonical balance validation stable across display currency changes', () => {
        const lines = [
            { amount: '100.00', transactionType: TransactionType.DEBIT as const, accountCurrency: 'USD' },
            { amount: '85.47', transactionType: TransactionType.CREDIT as const, accountCurrency: 'EUR', exchangeRate: 1.17 }
        ];
        const { result } = renderHook(() => useAdvancedJournalSummary(lines));

        expect(result.current.isBalanced).toBe(true);

        act(() => {
            result.current.setSelectedCurrency('EUR');
        });

        expect(result.current.selectedCurrency).toBe('EUR');
        expect(result.current.isBalanced).toBe(true);
    });
});
