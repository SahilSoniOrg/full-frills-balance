import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { AppConfig } from '@/src/constants/app-config';

jest.mock('@/src/services/AccountingRebuildService', () => ({
  accountingRebuildService: {
    rebuildAccountBalances: jest.fn(),
  },
}));

describe('rebuildAllAccountBalancesAfterImport', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const rebuildMock = accountingRebuildService.rebuildAccountBalances as jest.Mock;
  const accounts = Array.from({ length: 6 }, (_, i) => ({
    id: `acc-${i}` as AccountId,
    name: `Account ${i}`,
  }));
  const concurrency = AppConfig.performance.import.postImportAccountRebuildConcurrency;

  beforeEach(() => {
    jest.clearAllMocks();
    rebuildMock.mockResolvedValue(undefined);
  });

  it('rebuilds each account in the workplace', async () => {
    await rebuildAllAccountBalancesAfterImport(workplaceId, accounts, concurrency);

    expect(rebuildMock).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      expect(rebuildMock).toHaveBeenCalledWith(workplaceId, `acc-${i}`);
    }
  });

  it('respects concurrency limit under load', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    rebuildMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 25));
      inFlight -= 1;
    });

    await rebuildAllAccountBalancesAfterImport(workplaceId, accounts, concurrency);

    expect(maxInFlight).toBeLessThanOrEqual(concurrency);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('invokes progress callback per completed account', async () => {
    const progress = jest.fn();
    await rebuildAllAccountBalancesAfterImport(workplaceId, accounts, concurrency, progress);

    expect(progress).toHaveBeenCalledTimes(6);
    expect(progress).toHaveBeenLastCalledWith(accounts[5], 6, 6);
  });

  it('no-ops for an empty account list', async () => {
    await rebuildAllAccountBalancesAfterImport(workplaceId, [], concurrency);
    expect(rebuildMock).not.toHaveBeenCalled();
  });
});
