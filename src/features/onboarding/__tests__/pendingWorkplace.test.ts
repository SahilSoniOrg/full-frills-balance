import { storage } from '@/src/utils/storage';
import {
  cashClarityWorkplaceId,
  clearPendingCashClarityWorkplaceId,
  readPendingCashClarityWorkplaceId,
} from '../pendingWorkplace';

jest.mock('@/src/data/database/idGenerator', () => ({
  generator: () => 'fresh-workplace',
}));

describe('pending cash-clarity workplace id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storage.getString as jest.Mock).mockImplementation(() => undefined);
  });

  it('reuses a stored workplace id across process restarts', () => {
    (storage.getString as jest.Mock).mockImplementation((key: string) =>
      key === 'cash_clarity_pending_workplace_id' ? 'stored-workplace' : undefined,
    );
    expect(cashClarityWorkplaceId()).toBe('stored-workplace');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('mints and stores an id when none is pending', () => {
    expect(cashClarityWorkplaceId()).toBe('fresh-workplace');
    expect(storage.set).toHaveBeenCalledWith(
      'cash_clarity_pending_workplace_id',
      'fresh-workplace',
    );
  });

  it('clears the pending id after a successful commit', () => {
    (storage.getString as jest.Mock).mockImplementation((key: string) =>
      key === 'cash_clarity_pending_workplace_id' ? 'stored-workplace' : undefined,
    );
    expect(readPendingCashClarityWorkplaceId()).toBe('stored-workplace');
    clearPendingCashClarityWorkplaceId();
    expect(storage.remove).toHaveBeenCalledWith('cash_clarity_pending_workplace_id');
  });
});
