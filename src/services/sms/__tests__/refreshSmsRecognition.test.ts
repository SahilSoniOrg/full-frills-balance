import {
  refreshSmsRecognition,
  recognitionRefreshState,
  markRecognitionRefreshNeeded,
  withRecognitionRefresh,
  withRecognitionRefreshWhen,
} from '../refreshSmsRecognition';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { deviceSmsInboxRepository } from '@/src/data/repositories/DeviceSmsInboxRepository';
import { loadCaptureContext } from '@/src/services/transaction-intelligence/captureContext';
import { projectRecognition } from '../pipeline/smsDecision';
import { asWorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import type { SmsRecognitionReviewUpdate } from '@/src/data/repositories/DeviceSmsInboxRepository';

const mockRunAccountingWriteSession = jest.fn((work: (session: never) => Promise<unknown>) =>
  work({} as never),
);

jest.mock('@/src/data/repositories/TransactionInboxRepository', () => ({
  transactionInboxRepository: { findPendingSmsPage: jest.fn() },
}));
jest.mock('@/src/data/repositories/DeviceSmsInboxRepository', () => ({
  deviceSmsInboxRepository: { stagePendingRecognitionUpdates: jest.fn() },
}));
jest.mock('@/src/data/repositories/AccountingWriteSession', () => ({
  runAccountingWriteSession: (work: (session: never) => Promise<unknown>) =>
    mockRunAccountingWriteSession(work),
}));
jest.mock('@/src/services/transaction-intelligence/captureContext', () => ({
  loadCaptureContext: jest.fn(),
}));
jest.mock('../pipeline/smsDecision', () => ({ projectRecognition: jest.fn() }));

const workplace = asWorkplaceId('refresh-workplace');
const page = jest.mocked(transactionInboxRepository.findPendingSmsPage);
const stage = jest.mocked(deviceSmsInboxRepository.stagePendingRecognitionUpdates);
const stagedUpdates: SmsRecognitionReviewUpdate[][] = [];
const context = jest.mocked(loadCaptureContext);
const projection = jest.mocked(projectRecognition);
const record = (id: string) => ({
  deviceInboxId: id,
  deviceSourceId: id,
  parseStatus: 'parsed',
  inputDate: 1,
});

describe('refreshSmsRecognition', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRunAccountingWriteSession.mockImplementation(work => work({} as never));
    context.mockResolvedValue({} as never);
    projection.mockReturnValue({
      recognition: { status: 'none', accountIds: [], matcherIds: [] },
      suggestedAccounts: {},
    });
    stagedUpdates.length = 0;
    stage.mockImplementation(async (_session, _workplaceId, updates, shouldApply) => {
      if (shouldApply?.()) stagedUpdates.push([...updates]);
    });
  });

  it('processes every page, including an empty page of pending messages', async () => {
    page
      .mockResolvedValueOnce({ records: [record('1')] as never, nextCursor: '2' })
      .mockResolvedValueOnce({ records: [], nextCursor: '4' })
      .mockResolvedValueOnce({ records: [record('5')] as never, nextCursor: undefined });
    expect(await refreshSmsRecognition(workplace, 2)).toBe(2);
    expect(page.mock.calls.map(call => call[1])).toEqual([undefined, '2', '4']);
    expect(stage.mock.calls.map(call => call[2].length)).toEqual([1, 0, 1]);
    expect(recognitionRefreshState(workplace).value).toBe('ready');
  });

  it('prevents an older refresh from writing after a newer one starts', async () => {
    let release!: (value: never) => void;
    context.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve as typeof release;
        }),
    );
    page.mockResolvedValue({ records: [record('new')] as never, nextCursor: undefined });
    const old = refreshSmsRecognition(workplace);
    await refreshSmsRecognition(workplace);
    release({} as never);
    await old;
    expect(stage).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0][2][0].deviceInboxId).toBe('new');
  });

  it('keeps a durable pending marker after failure and clears it after a successful retry', async () => {
    page.mockRejectedValueOnce(new Error('read failed'));
    await expect(refreshSmsRecognition(workplace)).rejects.toThrow('read failed');
    expect(preferences.workplace.getSnapshot(workplace).accountMatcherRefreshPending).toBe(true);
    expect(recognitionRefreshState(workplace).value).toBe('failed');
    page.mockResolvedValueOnce({ records: [], nextCursor: undefined });
    await refreshSmsRecognition(workplace);
    expect(preferences.workplace.getSnapshot(workplace).accountMatcherRefreshPending).toBe(false);
    expect(recognitionRefreshState(workplace).value).toBe('ready');
  });

  it('keeps recognition pending until all overlapping mutations finish', async () => {
    page.mockResolvedValue({ records: [], nextCursor: undefined });
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = withRecognitionRefresh(
      workplace,
      () =>
        new Promise<void>(resolve => {
          finishFirst = resolve;
        }),
    );
    const second = withRecognitionRefresh(
      workplace,
      () =>
        new Promise<void>(resolve => {
          finishSecond = resolve;
        }),
    );

    finishFirst();
    await first;
    await refreshSmsRecognition(workplace);
    expect(page).not.toHaveBeenCalled();
    expect(preferences.workplace.getSnapshot(workplace).accountMatcherRefreshPending).toBe(true);
    expect(recognitionRefreshState(workplace).value).toBe('updating');

    finishSecond();
    await second;
    expect(page).toHaveBeenCalledTimes(1);
    expect(preferences.workplace.getSnapshot(workplace).accountMatcherRefreshPending).toBe(false);
    expect(recognitionRefreshState(workplace).value).toBe('ready');
  });

  it('does not refresh when a mutation does not change recognition eligibility', async () => {
    await withRecognitionRefreshWhen(workplace, async () => undefined);
    expect(page).not.toHaveBeenCalled();
  });

  it('does not update a pending parsed record without a deviceInboxId', async () => {
    page.mockResolvedValue({
      records: [record('kept'), { ...record('missing-device'), deviceInboxId: undefined }] as never,
      nextCursor: undefined,
    });

    expect(await refreshSmsRecognition(workplace)).toBe(1);
    expect(projection).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0][2].map(item => item.deviceInboxId)).toEqual(['kept']);
  });

  it('stops a page after recognition is invalidated and refreshes from the new context', async () => {
    const staleRecognition = {
      status: 'none' as const,
      accountIds: [],
      matcherIds: ['before-scan'],
    };
    const scanRecognition = {
      status: 'recognized' as const,
      accountIds: [],
      matcherIds: ['from-scan'],
    };
    context.mockResolvedValue({ phase: 'after' } as never);
    context.mockResolvedValueOnce({ phase: 'before' } as never);
    projection.mockImplementation((_message, _parsed, decisionContext) => ({
      recognition:
        (decisionContext as { phase?: string }).phase === 'after'
          ? scanRecognition
          : staleRecognition,
      suggestedAccounts: {},
    }));
    page.mockResolvedValue({ records: [record('row-1')] as never, nextCursor: undefined });
    page.mockImplementationOnce(async () => {
      markRecognitionRefreshNeeded(workplace);
      return { records: [record('row-1')] as never, nextCursor: undefined };
    });

    await refreshSmsRecognition(workplace);
    await refreshSmsRecognition(workplace);

    expect(projection.mock.calls.map(call => (call[2] as { phase?: string }).phase)).toEqual([
      'after',
    ]);
    expect(stagedUpdates.flatMap(updates => updates.map(item => item.recognition))).toEqual([
      scanRecognition,
    ]);
    expect(recognitionRefreshState(workplace).value).toBe('ready');
    expect(preferences.workplace.getSnapshot(workplace).accountMatcherRefreshPending).toBe(false);
  });

  it('continues past 200 pending messages', async () => {
    const first = Array.from({ length: 200 }, (_, index) => record(String(index)));
    page
      .mockResolvedValueOnce({ records: first as never, nextCursor: 'cursor' })
      .mockResolvedValueOnce({ records: [record('older')] as never, nextCursor: undefined });
    expect(await refreshSmsRecognition(workplace)).toBe(201);
    expect(stage.mock.calls[1][2][0].deviceInboxId).toBe('older');
  });
});
