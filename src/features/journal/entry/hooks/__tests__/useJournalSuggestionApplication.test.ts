import { act, renderHook } from '@testing-library/react-native';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId, type AccountId } from '@/src/types/ids';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
import {
  isJournalEntrySubmitDisabled,
  type JournalEntryScreenMode,
} from '../../journalEntryPresentation';
import { useJournalSuggestionApplication } from '../useJournalSuggestionApplication';
import { useJournalEntryModeState } from '../useJournalEntryModeState';
import { useSimpleJournalEditor } from '../useSimpleJournalEditor';
import { useTransactionComposerSession } from '../useTransactionComposerSession';

jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/services/journal/journalReadService', () => ({
  journalReadService: { find: jest.fn(), getJournalForEditor: jest.fn() },
}));
jest.mock('@/src/services/transaction-ingestion');
jest.mock('@/src/data/repositories/transaction');
jest.mock('@/src/services/analytics', () => ({
  analytics: { trackFeatureUsage: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn() })),
}));
jest.mock('@/src/hooks/use-currencies', () => ({
  useCurrencies: () => ({ currencies: [], isLoading: false }),
  useCurrencyPrecision: () => ({ precision: 2, isLoading: false }),
}));
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: () => ({
    fetchRate: jest.fn().mockResolvedValue(1),
    fetchRequiredRate: jest.fn().mockResolvedValue(1),
  }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'wp-1', defaultCurrencyCode: 'USD' }),
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    journalNav: {
      lastUsedSourceAccountId: undefined,
      lastUsedDestinationAccountId: undefined,
      setLastUsedSourceAccountId: jest.fn(),
      setLastUsedDestinationAccountId: jest.fn(),
    },
  },
}));

const accounts = [
  { id: asAccountId('cash'), name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('bank'), name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
  {
    id: asAccountId('salary'),
    name: 'Salary',
    accountType: AccountType.INCOME,
    currencyCode: 'USD',
  },
  { id: asAccountId('bonus'), name: 'Bonus', accountType: AccountType.INCOME, currencyCode: 'USD' },
];
const incomeSuggestion: JournalSuggestion = {
  key: 'salary-to-bank',
  description: 'Salary payment',
  route: {
    sources: [{ id: asAccountId('salary'), name: 'Salary', type: AccountType.INCOME }],
    destinations: [{ id: asAccountId('bank'), name: 'Bank', type: AccountType.ASSET }],
  },
  history: { count: 1, lastUsedAt: 1 },
};

describe('useJournalSuggestionApplication', () => {
  function renderSuggestionSession(
    options: {
      source?: AccountId;
      destination?: AccountId;
      mode?: JournalEntryScreenMode;
    } = {},
  ) {
    return renderHook(() => {
      const session = useTransactionComposerSession(asWorkplaceId('wp-1'), {
        accounts,
        currencyCode: 'USD',
        initialType: 'income',
        initialSourceId: options.source,
        initialDestinationId: options.destination,
        initialAmount: '100',
        initialDate: '2026-10-02',
      });
      const applySuggestion = useJournalSuggestionApplication(
        session.editor,
        accounts,
        options.mode ?? 'basic',
      );
      return { session, applySuggestion };
    });
  }

  it.each([
    {
      label: 'destination selected',
      destination: asAccountId('cash'),
      expectedSource: 'salary',
      expectedDestination: 'cash',
    },
    {
      label: 'source selected',
      source: asAccountId('bonus'),
      expectedSource: 'bonus',
      expectedDestination: 'bank',
    },
    {
      label: 'both selected',
      source: asAccountId('bonus'),
      destination: asAccountId('cash'),
      expectedSource: 'bonus',
      expectedDestination: 'cash',
    },
    { label: 'neither selected', expectedSource: 'salary', expectedDestination: 'bank' },
    {
      label: 'matching route selected',
      source: asAccountId('salary'),
      destination: asAccountId('bank'),
      expectedSource: 'salary',
      expectedDestination: 'bank',
    },
  ])(
    'fills only empty Simple accounts with $label',
    ({ expectedSource, expectedDestination, ...options }) => {
      const { result } = renderSuggestionSession(options);
      const initialLines = result.current.session.editor.lines;
      act(() => result.current.applySuggestion(incomeSuggestion));

      expect(result.current.session.editor.lines).toHaveLength(2);
      expect(
        result.current.session.editor.lines.find(
          line => line.transactionType === TransactionType.CREDIT,
        )?.accountId,
      ).toBe(asAccountId(expectedSource));
      expect(
        result.current.session.editor.lines.find(
          line => line.transactionType === TransactionType.DEBIT,
        )?.accountId,
      ).toBe(asAccountId(expectedDestination));
      expect(result.current.session.editor.lines.map(line => line.id).sort()).toEqual(
        initialLines.map(line => line.id).sort(),
      );
      expect(result.current.session.editor.lines.every(line => line.amount === '100')).toBe(true);
      expect(result.current.session.validationIssues).toEqual([]);

      act(() => result.current.applySuggestion(incomeSuggestion));
      expect(result.current.session.editor.lines).toHaveLength(2);
      expect(result.current.session.validationIssues).toEqual([]);
    },
  );

  it.each([
    { mode: 'allocation' as const, sourceCount: 1 },
    { mode: 'expert' as const, sourceCount: 2 },
  ])('only appends visible rows in $mode mode', ({ mode, sourceCount }) => {
    const { result } = renderSuggestionSession({
      mode,
      source: asAccountId('bonus'),
      destination: asAccountId('cash'),
    });
    act(() => result.current.applySuggestion(incomeSuggestion));

    const sourceLines = result.current.session.editor.lines.filter(
      line => line.transactionType === TransactionType.CREDIT,
    );
    expect(sourceLines).toHaveLength(sourceCount);
    expect(sourceLines[0]).toMatchObject({ accountId: asAccountId('bonus'), amount: '100' });
    expect(result.current.session.splitState.destinationLines.map(line => line.accountId)).toEqual([
      asAccountId('cash'),
      asAccountId('bank'),
    ]);

    act(() => result.current.applySuggestion(incomeSuggestion));
    expect(result.current.session.editor.lines).toHaveLength(sourceCount + 2);
  });

  it('applies only the description for a split route in Simple mode', () => {
    const { result } = renderSuggestionSession({ destination: asAccountId('cash') });
    const initialLines = result.current.session.editor.lines;
    act(() =>
      result.current.applySuggestion({
        ...incomeSuggestion,
        route: {
          ...incomeSuggestion.route,
          destinations: [
            ...incomeSuggestion.route.destinations,
            { id: asAccountId('cash'), name: 'Cash', type: AccountType.ASSET },
          ],
        },
      }),
    );
    expect(result.current.session.editor.description).toBe('Salary payment');
    expect(result.current.session.editor.lines).toEqual(initialLines);
  });

  it.each([
    { sources: [], destinations: incomeSuggestion.route.destinations },
    { sources: incomeSuggestion.route.sources, destinations: [] },
    {
      sources: [{ ...incomeSuggestion.route.sources[0], id: asAccountId('missing') }],
      destinations: incomeSuggestion.route.destinations,
    },
    {
      sources: incomeSuggestion.route.sources,
      destinations: [{ ...incomeSuggestion.route.destinations[0], id: asAccountId('missing') }],
    },
  ])('leaves accounts untouched for an incomplete route %#', route => {
    const { result } = renderSuggestionSession();
    const initialLines = result.current.session.editor.lines;
    act(() => result.current.applySuggestion({ ...incomeSuggestion, route }));
    expect(result.current.session.editor.description).toBe(incomeSuggestion.description);
    expect(result.current.session.editor.lines).toEqual(initialLines);
  });

  it('fills an existing split row without duplicating selected accounts or losing its inputs', () => {
    const { result } = renderSuggestionSession({
      mode: 'allocation',
      source: asAccountId('salary'),
      destination: asAccountId('cash'),
    });
    act(() => result.current.session.editor.addLine());
    const row = result.current.session.editor.lines.at(-1)!;
    act(() => result.current.session.editor.updateLine(row.id, { amount: '25', notes: 'Bonus' }));
    act(() =>
      result.current.applySuggestion({
        ...incomeSuggestion,
        route: {
          ...incomeSuggestion.route,
          destinations: [
            { id: asAccountId('cash'), name: 'Cash', type: AccountType.ASSET },
            ...incomeSuggestion.route.destinations,
          ],
        },
      }),
    );
    expect(result.current.session.editor.lines).toHaveLength(3);
    expect(result.current.session.editor.lines.find(line => line.id === row.id)).toMatchObject({
      accountId: asAccountId('bank'),
      accountName: 'Bank',
      accountType: AccountType.ASSET,
      accountCurrency: 'USD',
      amount: '25',
      notes: 'Bonus',
    });
  });

  it('keeps account-details income suggestions saveable without a hidden destination', async () => {
    const { journalService } = jest.requireMock('@/src/services/journal/journalDomainService');
    journalService.postPostingPlan.mockResolvedValue({ success: true, action: 'created' });
    const { result } = renderHook(() => {
      const session = useTransactionComposerSession(asWorkplaceId('wp-1'), {
        accounts,
        currencyCode: 'USD',
        initialSourceId: asAccountId('cash'),
        initialDate: '2026-10-02',
      });
      const simple = useSimpleJournalEditor({
        accounts,
        editor: session.editor,
        onSelectAccountRequest: jest.fn(),
      });
      const modeState = useJournalEntryModeState(session.editor);
      const applySuggestion = useJournalSuggestionApplication(
        session.editor,
        accounts,
        modeState.activeMode,
      );
      return { session, simple, modeState, applySuggestion };
    });

    act(() => result.current.simple.setType('income'));
    expect(result.current.simple.destinationId).toBe(asAccountId('cash'));
    act(() => result.current.simple.setAmount('100'));
    act(() => result.current.session.editor.setDescription('Sal'));
    act(() => result.current.applySuggestion(incomeSuggestion));

    expect(result.current.session.editor.description).toBe('Salary payment');
    expect(result.current.simple.sourceId).toBe(asAccountId('salary'));
    expect(result.current.simple.destinationId).toBe(asAccountId('cash'));
    expect(result.current.session.splitState.destinationLines).toHaveLength(1);
    expect(result.current.session.editor.lines).toHaveLength(2);
    expect(result.current.session.validationIssues).toEqual([]);
    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'basic',
        validationIssues: result.current.session.validationIssues,
      }),
    ).toBe(false);

    act(() => result.current.modeState.onToggleMode('allocation'));
    expect(result.current.modeState.activeMode).toBe('allocation');
    expect(result.current.session.splitState.destinationLines).toHaveLength(1);
    act(() => result.current.modeState.onToggleMode('basic'));
    expect(result.current.modeState.activeMode).toBe('basic');

    await act(async () => {
      await result.current.session.submit('editor');
    });
    expect(journalService.postPostingPlan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: asAccountId('cash'),
              amount: '100',
              transactionType: TransactionType.DEBIT,
            }),
            expect.objectContaining({
              accountId: asAccountId('salary'),
              amount: '100',
              transactionType: TransactionType.CREDIT,
            }),
          ]),
        }),
      }),
    );
    expect(journalService.postPostingPlan.mock.calls.at(-1)[0].plan.lines).toHaveLength(2);
  });
});
