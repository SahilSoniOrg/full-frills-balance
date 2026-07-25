import { useJournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useAccounts } from '@/src/features/accounts';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { act, renderHook } from '@testing-library/react-native';

// Mock all external view model hooks & contexts
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(),
}));

jest.mock('@/src/features/accounts', () => ({
  useAccounts: jest.fn(),
}));

jest.mock('@/src/features/journal/entry/hooks/useJournalEditor', () => ({
  useJournalEditor: jest.fn(),
}));

jest.mock('@/src/features/journal/entry/hooks/useSimpleJournalEditor', () => ({
  useSimpleJournalEditor: jest.fn(),
}));

jest.mock('@/src/features/journal/hooks/useJournalSuggestions', () => ({
  useJournalSuggestions: jest.fn(() => ({ suggestions: [] })),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({})),
}));

describe('useJournalEntryViewModel - Voice Input', () => {
  const mockWorkplaceId = 'workplace-123' as WorkplaceId;
  const mockAccounts = [
    {
      id: 'acc-cash',
      name: 'Cash Asset Account',
      accountType: AccountType.ASSET,
      currencyCode: 'INR',
    },
    {
      id: 'acc-food',
      name: 'Food Expense Category',
      accountType: AccountType.EXPENSE,
      currencyCode: 'INR',
    },
    {
      id: 'acc-salary',
      name: 'Salary Income Category',
      accountType: AccountType.INCOME,
      currencyCode: 'INR',
    },
  ];

  let mockEditor: any;
  let mockSimpleEditor: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (useWorkplace as jest.Mock).mockReturnValue({
      workplaceId: mockWorkplaceId,
      defaultCurrencyCode: 'INR',
    });

    (useAccounts as jest.Mock).mockReturnValue({
      accounts: mockAccounts,
      isLoading: false,
    });

    // Default mock useJournalEditor (Guided Mode)
    mockEditor = {
      isGuidedMode: true,
      setIsGuidedMode: jest.fn(),
      description: '',
      notes: '',
      setDescription: jest.fn(),
      setNotes: jest.fn(),
      setTransactionType: jest.fn(),
      setLines: jest.fn(),
      getLineIdByRole: jest.fn(),
      resolveActiveLineId: jest.fn(),
      updateLine: jest.fn(),
      lines: [
        {
          id: 'line-debit',
          transactionType: TransactionType.DEBIT,
          accountId: 'acc-food',
          amount: '0',
          accountCurrency: 'INR',
        },
        {
          id: 'line-credit',
          transactionType: TransactionType.CREDIT,
          accountId: 'acc-cash',
          amount: '0',
          accountCurrency: 'INR',
        },
      ],
    };
    (useJournalEditor as jest.Mock).mockReturnValue(mockEditor);

    mockSimpleEditor = {
      type: 'expense',
      setType: jest.fn(),
      setAmount: jest.fn(),
      setSourceId: jest.fn(),
      setDestinationId: jest.fn(),
      displayCurrency: 'INR',
      isValidAmount: true,
      handleSave: jest.fn(),
    };
    (useSimpleJournalEditor as jest.Mock).mockReturnValue(mockSimpleEditor);
  });

  it('updates form fields in Guided Mode when voice transcription is applied', () => {
    mockEditor.isGuidedMode = true;

    const { result } = renderHook(() => useJournalEntryViewModel());

    act(() => {
      result.current.handleApplyVoiceInput({
        amount: 250,
        merchantName: 'Starbucks Coffee',
        direction: 'debit',
        sourceAccountId: 'acc-cash' as AccountId,
        categoryAccountId: 'acc-food' as AccountId,
        transcription: '250 rs for coffee from cash',
      });
    });

    // 1. Description and notes check
    expect(mockEditor.setDescription).toHaveBeenCalledWith('Starbucks Coffee');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 250 rs for coffee from cash',
    );

    // 2. Guided Editor mapping check
    expect(mockSimpleEditor.setType).toHaveBeenCalledWith('expense');
    expect(mockSimpleEditor.setAmount).toHaveBeenCalledWith('250');
    expect(mockSimpleEditor.setSourceId).toHaveBeenCalledWith('acc-cash');
    expect(mockSimpleEditor.setDestinationId).toHaveBeenCalledWith('acc-food');
  });

  it('updates transaction lines in Advanced Mode when voice transcription is applied', () => {
    mockEditor.isGuidedMode = false;

    const { result } = renderHook(() => useJournalEntryViewModel());

    act(() => {
      result.current.handleApplyVoiceInput({
        amount: 250,
        merchantName: 'Starbucks Coffee',
        direction: 'debit',
        sourceAccountId: 'acc-cash' as AccountId,
        categoryAccountId: 'acc-food' as AccountId,
        transcription: '250 rs for coffee from cash',
      });
    });

    // 1. Description and notes check
    expect(mockEditor.setDescription).toHaveBeenCalledWith('Starbucks Coffee');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 250 rs for coffee from cash',
    );

    // 2. Advanced Editor mapping check (lines sync)
    expect(mockEditor.setTransactionType).toHaveBeenCalledWith('expense');
    expect(mockEditor.setLines).toHaveBeenCalled();

    // Verify setLines functional update matches correctly
    const setLinesCallback = mockEditor.setLines.mock.calls[0][0];
    const initialLines = mockEditor.lines;
    const updatedLines = setLinesCallback(initialLines);

    // Debit Line is resolved to acc-food (Category Account)
    const debitLine = updatedLines.find((l: any) => l.transactionType === TransactionType.DEBIT);
    expect(debitLine.accountId).toBe('acc-food');
    expect(debitLine.accountName).toBe('Food Expense Category');
    expect(debitLine.accountType).toBe(AccountType.EXPENSE);
    expect(debitLine.amount).toBe('250');

    // Credit Line is resolved to acc-cash (Source Account)
    const creditLine = updatedLines.find((l: any) => l.transactionType === TransactionType.CREDIT);
    expect(creditLine.accountId).toBe('acc-cash');
    expect(creditLine.accountName).toBe('Cash Asset Account');
    expect(creditLine.accountType).toBe(AccountType.ASSET);
    expect(creditLine.amount).toBe('250');
  });

  it('updates form fields in Guided Mode when voice transcription is applied for income', () => {
    mockEditor.isGuidedMode = true;

    const { result } = renderHook(() => useJournalEntryViewModel());

    act(() => {
      result.current.handleApplyVoiceInput({
        amount: 50000,
        merchantName: 'Acme Corporation',
        direction: 'credit',
        sourceAccountId: 'acc-cash' as AccountId,
        categoryAccountId: 'acc-salary' as AccountId,
        transcription: '50000 rupees for salary received from acme corporation',
      });
    });

    // 1. Description and notes check
    expect(mockEditor.setDescription).toHaveBeenCalledWith('Acme Corporation');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 50000 rupees for salary received from acme corporation',
    );

    // 2. Guided Editor mapping check - Income Category is Source, Asset Account is Destination
    expect(mockSimpleEditor.setType).toHaveBeenCalledWith('income');
    expect(mockSimpleEditor.setAmount).toHaveBeenCalledWith('50000');
    expect(mockSimpleEditor.setSourceId).toHaveBeenCalledWith('acc-salary');
    expect(mockSimpleEditor.setDestinationId).toHaveBeenCalledWith('acc-cash');
  });

  it('updates transaction lines in Advanced Mode when voice transcription is applied for income', () => {
    mockEditor.isGuidedMode = false;

    const { result } = renderHook(() => useJournalEntryViewModel());

    act(() => {
      result.current.handleApplyVoiceInput({
        amount: 50000,
        merchantName: 'Acme Corporation',
        direction: 'credit',
        sourceAccountId: 'acc-cash' as AccountId,
        categoryAccountId: 'acc-salary' as AccountId,
        transcription: '50000 rupees for salary received from acme corporation',
      });
    });

    // 1. Description and notes check
    expect(mockEditor.setDescription).toHaveBeenCalledWith('Acme Corporation');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 50000 rupees for salary received from acme corporation',
    );

    // 2. Advanced Editor mapping check (lines sync)
    expect(mockEditor.setTransactionType).toHaveBeenCalledWith('income');
    expect(mockEditor.setLines).toHaveBeenCalled();

    // Verify setLines functional update matches correctly
    const setLinesCallback = mockEditor.setLines.mock.calls[0][0];
    const initialLines = mockEditor.lines;
    const updatedLines = setLinesCallback(initialLines);

    // Debit Line is resolved to acc-cash (Asset Account - Destination)
    const debitLine = updatedLines.find((l: any) => l.transactionType === TransactionType.DEBIT);
    expect(debitLine.accountId).toBe('acc-cash');
    expect(debitLine.accountName).toBe('Cash Asset Account');
    expect(debitLine.accountType).toBe(AccountType.ASSET);
    expect(debitLine.amount).toBe('50000');

    // Credit Line is resolved to acc-salary (Income Category - Source)
    const creditLine = updatedLines.find((l: any) => l.transactionType === TransactionType.CREDIT);
    expect(creditLine.accountId).toBe('acc-salary');
    expect(creditLine.accountName).toBe('Salary Income Category');
    expect(creditLine.accountType).toBe(AccountType.INCOME);
    expect(creditLine.amount).toBe('50000');
  });
});
