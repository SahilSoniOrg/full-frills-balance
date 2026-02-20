import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/hooks/useExchangeRate', () => ({
    useExchangeRate: jest.fn(() => ({
        fetchRate: jest.fn().mockResolvedValue(1),
    })),
}));

jest.mock('@/src/features/journal/hooks/useAccountSelection', () => ({
    useAccountSelection: jest.fn(({ accounts }) => ({
        transactionAccounts: accounts,
        expenseAccounts: accounts,
        incomeAccounts: accounts,
    })),
}));

jest.mock('@/src/utils/preferences', () => ({
    preferences: {
        defaultCurrencyCode: 'USD',
        setLastUsedSourceAccountId: jest.fn().mockResolvedValue(undefined),
        setLastUsedDestinationAccountId: jest.fn().mockResolvedValue(undefined),
    },
}));

function createEditor(success: boolean) {
    return {
        transactionType: 'expense' as const,
        setTransactionType: jest.fn(),
        isGuidedMode: true,
        lines: [
            {
                id: '1',
                accountId: 'source',
                accountName: 'Cash',
                accountType: AccountType.ASSET,
                amount: '10',
                transactionType: TransactionType.CREDIT,
                notes: '',
                exchangeRate: '',
                accountCurrency: 'USD',
            },
            {
                id: '2',
                accountId: 'destination',
                accountName: 'Food',
                accountType: AccountType.EXPENSE,
                amount: '10',
                transactionType: TransactionType.DEBIT,
                notes: '',
                exchangeRate: '',
                accountCurrency: 'USD',
            },
        ],
        updateLine: jest.fn(),
        description: 'Lunch',
        setDescription: jest.fn(),
        submit: jest.fn().mockResolvedValue({ success }),
        isSubmitting: false,
        journalDate: '2026-01-01',
        journalTime: '12:00',
    };
}

describe('useSimpleJournalEditor', () => {
    const accounts = [
        { id: 'source', name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
        { id: 'destination', name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
    ] as any;

    it('navigates via onSuccess when submit succeeds', async () => {
        const onSuccess = jest.fn();
        const editor = createEditor(true);

        const { result } = renderHook(() =>
            useSimpleJournalEditor({
                accounts,
                onSuccess,
                editor: editor as any,
            })
        );

        await act(async () => {
            await result.current.handleSave();
        });

        expect(editor.submit).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('does not navigate via onSuccess when submit fails', async () => {
        const onSuccess = jest.fn();
        const editor = createEditor(false);

        const { result } = renderHook(() =>
            useSimpleJournalEditor({
                accounts,
                onSuccess,
                editor: editor as any,
            })
        );

        await act(async () => {
            await result.current.handleSave();
        });

        expect(editor.submit).toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
