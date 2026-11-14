import { storage } from '@/src/data/storage/storage';
import {
  cashClarityWorkplaceId,
  clearPendingCashClarityWorkplaceId,
  readPendingCashClarityWorkplaceId,
} from '../pendingWorkplace';

jest.mock('@/src/data/database/idGenerator', () => ({
  generator: () => 'fresh-workplace',
}));

describe('cash-clarity operation identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storage.getString as jest.Mock).mockImplementation((key: string) =>
      key === 'cash_clarity_pending_workplace_id' ? 'old-bare-id' : undefined,
    );
  });

  it('mints an ID for the session instead of trusting the retired bare pending key', () => {
    expect(cashClarityWorkplaceId()).toBe('fresh-workplace');
    expect(storage.set).not.toHaveBeenCalled();
    expect(readPendingCashClarityWorkplaceId()).toBeUndefined();
  });

  it('only clears the retired compatibility key when asked', () => {
    clearPendingCashClarityWorkplaceId();
    expect(storage.remove).toHaveBeenCalledWith('cash_clarity_pending_workplace_id');
  });
});
