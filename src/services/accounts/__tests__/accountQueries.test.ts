import { of } from 'rxjs';

import { accountQueries } from '@/src/services/accounts/accountQueries';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import type Account from '@/src/data/models/Account';
import type { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/repositories/account', () => ({
  accountObserveQueries: {
    observeAll: jest.fn(),
  },
  accountQueryRepository: {
    findAll: jest.fn(),
  },
}));

jest.mock('@/src/services/reactive/reactiveWorkplaceObserves', () => ({
  observeWorkplaceAccounts: jest.fn(),
}));

describe('accountQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes observeAll through the shared workplace cache', () => {
    const workplaceId = 'workplace-1' as WorkplaceId;
    jest.mocked(observeWorkplaceAccounts).mockReturnValue(of([] as Account[]));

    accountQueries.observeAll(workplaceId).subscribe();

    expect(observeWorkplaceAccounts).toHaveBeenCalledWith(workplaceId);
    expect(accountObserveQueries.observeAll).not.toHaveBeenCalled();
  });
});
