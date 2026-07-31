import { useJournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useAccounts } from '@/src/features/accounts';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  ModeHandleProvider,
  useRegisterModeHandle,
} from '@/src/features/journal/entry/modes/ModeHandleContext';
import { ModeHandleVoiceParams } from '@/src/features/journal/entry/modes/ModeHandle';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { act, renderHook } from '@testing-library/react-native';
import { ReactNode } from 'react';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(),
}));

jest.mock('@/src/features/accounts', () => ({
  useAccounts: jest.fn(),
}));

jest.mock('@/src/features/journal/entry/hooks/useJournalEditor', () => ({
  useJournalEditor: jest.fn(),
}));

jest.mock('@/src/features/journal/hooks/useJournalSuggestions', () => ({
  useJournalSuggestions: jest.fn(() => ({ suggestions: [] })),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({})),
}));

function VoiceApplyRegistrar({
  applyVoice,
}: {
  applyVoice: (params: ModeHandleVoiceParams) => void;
}) {
  useRegisterModeHandle({
    submitLabel: 'Save',
    isSubmitDisabled: false,
    submit: () => {},
    applyVoice,
  });
  return null;
}

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

    mockEditor = {
      isGuidedMode: true,
      setIsGuidedMode: jest.fn(),
      description: '',
      notes: '',
      setDescription: jest.fn(),
      setNotes: jest.fn(),
      setTransactionType: jest.fn(),
      setLines: jest.fn(),
      isEdit: false,
      isLoading: false,
      isSubmitting: false,
      lines: [
        {
          id: '1',
          transactionType: TransactionType.DEBIT,
          accountId: 'acc-food',
          amount: '0',
          accountCurrency: 'INR',
        },
        {
          id: '2',
          transactionType: TransactionType.CREDIT,
          accountId: 'acc-cash',
          amount: '0',
          accountCurrency: 'INR',
        },
      ],
      transactionType: 'expense',
      updateLine: jest.fn(),
      resolveActiveLineId: jest.fn((id: string) => id),
      getLineIdByRole: jest.fn(),
    };
    (useJournalEditor as jest.Mock).mockReturnValue(mockEditor);
  });

  it('routes guided voice apply through ModeHandle.applyVoice', () => {
    mockEditor.isGuidedMode = true;
    const applyVoice = jest.fn();

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <ModeHandleProvider>
          <VoiceApplyRegistrar applyVoice={applyVoice} />
          {children}
        </ModeHandleProvider>
      );
    }

    const { result } = renderHook(() => useJournalEntryViewModel(), { wrapper });

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

    expect(mockEditor.setDescription).toHaveBeenCalledWith('Starbucks Coffee');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 250 rs for coffee from cash',
    );
    expect(applyVoice).toHaveBeenCalled();
    expect(mockEditor.setLines).not.toHaveBeenCalled();
  });

  it('updates transaction lines in Advanced Mode when voice transcription is applied', () => {
    mockEditor.isGuidedMode = false;

    function wrapper({ children }: { children: ReactNode }) {
      return <ModeHandleProvider>{children}</ModeHandleProvider>;
    }

    const { result } = renderHook(() => useJournalEntryViewModel(), { wrapper });

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

    expect(mockEditor.setDescription).toHaveBeenCalledWith('Starbucks Coffee');
    expect(mockEditor.setNotes).toHaveBeenCalledWith(
      'Spoken transcript: 250 rs for coffee from cash',
    );
    expect(mockEditor.setTransactionType).toHaveBeenCalledWith('expense');
    expect(mockEditor.setLines).toHaveBeenCalled();

    const setLinesCallback = mockEditor.setLines.mock.calls[0][0];
    const updatedLines = setLinesCallback(mockEditor.lines);

    const debitLine = updatedLines.find((l: any) => l.transactionType === TransactionType.DEBIT);
    expect(debitLine.accountId).toBe('acc-food');
    expect(debitLine.accountName).toBe('Food Expense Category');
    expect(debitLine.accountType).toBe(AccountType.EXPENSE);
    expect(debitLine.amount).toBe('250');

    const creditLine = updatedLines.find((l: any) => l.transactionType === TransactionType.CREDIT);
    expect(creditLine.accountId).toBe('acc-cash');
    expect(creditLine.accountName).toBe('Cash Asset Account');
    expect(creditLine.accountType).toBe(AccountType.ASSET);
    expect(creditLine.amount).toBe('250');
  });

  it('updates transaction lines for income when no ModeHandle.applyVoice is registered', () => {
    mockEditor.isGuidedMode = false;

    function wrapper({ children }: { children: ReactNode }) {
      return <ModeHandleProvider>{children}</ModeHandleProvider>;
    }

    const { result } = renderHook(() => useJournalEntryViewModel(), { wrapper });

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

    expect(mockEditor.setTransactionType).toHaveBeenCalledWith('income');
    expect(mockEditor.setLines).toHaveBeenCalled();

    const setLinesCallback = mockEditor.setLines.mock.calls[0][0];
    const updatedLines = setLinesCallback(mockEditor.lines);

    const debitLine = updatedLines.find((l: any) => l.transactionType === TransactionType.DEBIT);
    expect(debitLine.accountId).toBe('acc-cash');
    expect(debitLine.amount).toBe('50000');

    const creditLine = updatedLines.find((l: any) => l.transactionType === TransactionType.CREDIT);
    expect(creditLine.accountId).toBe('acc-salary');
    expect(creditLine.amount).toBe('50000');
  });
});
