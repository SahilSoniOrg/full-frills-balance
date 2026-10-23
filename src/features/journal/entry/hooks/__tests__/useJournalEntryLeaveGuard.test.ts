import { act, renderHook, waitFor } from '@testing-library/react-native';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { EMPTY_ACCOUNT_ID, asAccountId } from '@/src/types/ids';
import { resolveFxPair } from '@/src/domain/accounting/fxPair';
import type { BulkJournalRow } from '../../types/bulkJournal';
import {
  createJournalDraftFingerprint,
  useJournalEntryLeaveGuard,
} from '../useJournalEntryLeaveGuard';

const mockDispatch = jest.fn();
let mockPreventRemove = false;
let mockPreventCallback: ((event: { data: { action: { type: string } } }) => void) | undefined;

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (
    enabled: boolean,
    callback: (event: { data: { action: { type: string } } }) => void,
  ) => {
    mockPreventRemove = enabled;
    mockPreventCallback = callback;
  },
}));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));

function latestConfirm() {
  return (confirm.show as jest.Mock).mock.calls.at(-1)?.[0] as { onConfirm: () => void };
}

function emptyRow(id: string, journalDate: number): BulkJournalRow {
  return {
    id,
    journalDate,
    description: '',
    notes: '',
    amount: '',
    transactionType: 'transfer',
    sourceId: EMPTY_ACCOUNT_ID,
    destinationId: EMPTY_ACCOUNT_ID,
    exchangeRate: '',
    isCrossCurrency: false,
    convertedAmount: 0,
    isLoadingRate: false,
    pair: resolveFxPair({ baseCurrency: 'USD' }),
  };
}

function fingerprint(batchRows: BulkJournalRow[]) {
  return createJournalDraftFingerprint({
    description: '',
    notes: '',
    journalDate: '2026-10-22',
    journalTime: '12:00',
    transactionType: 'transfer',
    lines: [],
    batchRows,
  });
}

describe('useJournalEntryLeaveGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreventRemove = false;
    mockPreventCallback = undefined;
  });

  it('leaves without prompting after adding and deleting blank rows, including the last row', async () => {
    const original = emptyRow('original', 1000);
    const { result, rerender } = renderHook(
      ({ rows }: { rows: BulkJournalRow[] }) =>
        useJournalEntryLeaveGuard({
          fingerprint: fingerprint(rows),
          baselineReady: true,
        }),
      { initialProps: { rows: [original] } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ rows: [original, emptyRow('added', 1000)] });
    expect(result.current.isDirty).toBe(false);
    rerender({ rows: [emptyRow('replacement', 5000)] });
    expect(result.current.isDirty).toBe(false);
    expect(mockPreventRemove).toBe(false);
    act(() => result.current.onClose());
    expect(AppNavigation.back).toHaveBeenCalledTimes(1);
    expect(confirm.show).not.toHaveBeenCalled();
  });

  it.each([
    { description: 'Coffee' },
    { notes: 'Remember receipt' },
    { amount: '5' },
    { sourceId: asAccountId('cash') },
    { destinationId: asAccountId('food') },
  ])('still prompts for entered data: %j', async edit => {
    const original = emptyRow('original', 1000);
    const { result, rerender } = renderHook(
      ({ rows }: { rows: BulkJournalRow[] }) =>
        useJournalEntryLeaveGuard({
          fingerprint: fingerprint(rows),
          baselineReady: true,
        }),
      { initialProps: { rows: [original] } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ rows: [{ ...original, ...edit }, emptyRow('added', 1000)] });
    rerender({ rows: [{ ...original, ...edit }] });
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.onClose());
    expect(confirm.show).toHaveBeenCalledTimes(1);
    expect(AppNavigation.back).not.toHaveBeenCalled();
  });

  it('prompts before closing a changed journal draft', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    expect(mockPreventRemove).toBe(true);

    act(() => result.current.onClose());
    expect(AppNavigation.back).not.toHaveBeenCalled();
    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
  });

  it('replays system navigation only after discard confirmation', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    const action = { type: 'GO_BACK' };

    act(() => mockPreventCallback?.({ data: { action } }));
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => latestConfirm().onConfirm());
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
  });

  it('bypasses the prompt after a successful save', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useJournalEntryLeaveGuard({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } as { fingerprint: string } },
    );
    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));

    act(() => result.current.leaveAfterSave());
    await waitFor(() => expect(AppNavigation.back).toHaveBeenCalledTimes(1));
    expect(confirm.show).not.toHaveBeenCalled();
  });
});
