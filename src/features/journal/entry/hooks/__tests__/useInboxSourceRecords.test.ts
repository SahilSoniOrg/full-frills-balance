import { act, renderHook, waitFor } from '@testing-library/react-native';
import { logger } from '@/src/services/observability/logger';
import { smsService } from '@/src/services/sms-service';
import { TransactionDirection } from '@/src/types/enums';
import { asJournalId, asWorkplaceId } from '@/src/types/ids';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { useInboxSourceRecords } from '../useInboxSourceRecords';

jest.mock('@/src/services/sms-service', () => ({
  smsService: {
    findInboxRecord: jest.fn(),
    findAllByLinkedJournalId: jest.fn(),
  },
}));

jest.mock('@/src/services/observability/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

function makeRecord(id: string, senderAddress: string): PlainInboxRecord {
  return {
    id,
    channel: 'sms',
    deviceSourceId: 'dev-1',
    senderAddress,
    rawBody: `Message ${id}`,
    inputDate: 1_700_000_000_000,
    parseStatus: 'parsed',
    direction: TransactionDirection.DEBIT,
    processingStatus: 'pending',
  };
}

describe('useInboxSourceRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears previous workplace items immediately when workplaceId changes before lookup settles', async () => {
    const wp1 = asWorkplaceId('wp-1');
    const wp2 = asWorkplaceId('wp-2');
    const wp1Item = makeRecord('rec-1', 'WP1-BANK');
    const wp2Item = makeRecord('rec-1', 'WP2-BANK');

    let resolveWp2!: (value: PlainInboxRecord | null) => void;
    const wp2Pending = new Promise<PlainInboxRecord | null>(resolve => {
      resolveWp2 = resolve;
    });

    (smsService.findInboxRecord as jest.Mock).mockImplementation((workplaceId: string) => {
      if (workplaceId === wp1) return Promise.resolve(wp1Item);
      return wp2Pending;
    });

    const { result, rerender } = renderHook(
      ({ workplaceId }: { workplaceId: ReturnType<typeof asWorkplaceId> }) =>
        useInboxSourceRecords({
          workplaceId,
          smsRecordId: 'rec-1',
          isEdit: false,
        }),
      { initialProps: { workplaceId: wp1 } },
    );

    await waitFor(() => expect(result.current).toEqual([wp1Item]));

    rerender({ workplaceId: wp2 });
    expect(result.current).toEqual([]);

    resolveWp2(wp2Item);
    await waitFor(() => expect(result.current).toEqual([wp2Item]));
  });

  it('loads linked journal inbox records in edit mode scoped by workplaceId', async () => {
    const wp1 = asWorkplaceId('wp-1');
    const wp2 = asWorkplaceId('wp-2');
    const journalId = asJournalId('j-1');
    const wp1Items = [makeRecord('rec-1', 'WP1-BANK')];

    let resolveWp2!: (value: PlainInboxRecord[]) => void;
    const wp2Pending = new Promise<PlainInboxRecord[]>(resolve => {
      resolveWp2 = resolve;
    });

    (smsService.findAllByLinkedJournalId as jest.Mock).mockImplementation((workplaceId: string) => {
      if (workplaceId === wp1) return Promise.resolve(wp1Items);
      return wp2Pending;
    });

    const { result, rerender } = renderHook(
      ({ workplaceId }: { workplaceId: ReturnType<typeof asWorkplaceId> }) =>
        useInboxSourceRecords({
          workplaceId,
          journalId,
          isEdit: true,
        }),
      { initialProps: { workplaceId: wp1 } },
    );

    await waitFor(() => expect(result.current).toEqual(wp1Items));

    rerender({ workplaceId: wp2 });
    expect(result.current).toEqual([]);

    await act(async () => {
      resolveWp2([]);
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
  });

  it('logs a warning and returns empty array when lookup fails', async () => {
    const wp1 = asWorkplaceId('wp-1');
    (smsService.findInboxRecord as jest.Mock).mockRejectedValue(new Error('db read failed'));

    const { result } = renderHook(() =>
      useInboxSourceRecords({
        workplaceId: wp1,
        smsRecordId: 'rec-1',
        isEdit: false,
      }),
    );

    await waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);
  });
});
