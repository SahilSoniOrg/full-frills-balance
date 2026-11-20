import { balanceRebuildIntentRepository } from '@/src/data/repositories/BalanceRebuildIntentRepository';
import { accountWriteRepository } from '@/src/data/repositories/account';
import {
  runAccountingWriteSession,
  stageBalanceRebuildIntents,
} from '@/src/data/repositories/AccountingWriteSession';
import { storage } from '@/src/data/storage/storage';
import { RebuildQueueService } from '@/src/services/RebuildQueueService';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';

const workplaceId = asWorkplaceId('rebuild-workplace');
const accountId = asAccountId('rebuild-account');
const legacyQueue = 'rebuild_queue_v1';
const legacyProcessing = 'rebuild_processing_batch_v1';

async function stage(fromDate: number): Promise<void> {
  await runAccountingWriteSession(async session => {
    stageBalanceRebuildIntents(session, workplaceId, [accountId], fromDate);
  });
}

describe('durable balance rebuild queue', () => {
  const queue = new RebuildQueueService();

  beforeEach(async () => {
    await resetDatabase();
    storage.remove(legacyQueue);
    storage.remove(legacyProcessing);
  });

  afterEach(() => {
    queue.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
    storage.remove(legacyQueue);
    storage.remove(legacyProcessing);
  });

  it('retains the earliest date and discards the entire intent on rollback', async () => {
    await stage(300);
    await stage(100);
    await expect(
      runAccountingWriteSession(async session => {
        stageBalanceRebuildIntents(session, workplaceId, [accountId], 50);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    const pending = await balanceRebuildIntentRepository.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ workplaceId, accountId, fromDate: 100 });
  });

  it('retains a newer revision when a stale claim finishes', async () => {
    await stage(300);
    const [claimed] = await balanceRebuildIntentRepository.listPending();
    await stage(100);
    await expect(accountingRebuildService.rebuildIntent(claimed, () => true)).resolves.toBe(
      'superseded',
    );
    const [pending] = await balanceRebuildIntentRepository.listPending();
    expect(pending).toMatchObject({ fromDate: 100 });
    expect(pending.revision).not.toBe(claimed.revision);

    await queue.flush();
    expect(await balanceRebuildIntentRepository.listPending()).toEqual([]);
  });

  it('keeps the claim pending if projection preparation observes cancellation', async () => {
    await accountWriteRepository.create({
      id: accountId,
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    await stage(100);
    const [claim] = await balanceRebuildIntentRepository.listPending();
    const findCurrent = balanceRebuildIntentRepository.findCurrent;
    let commitChecks = 0;
    let checkingCommit = false;
    jest
      .spyOn(balanceRebuildIntentRepository, 'findCurrent')
      .mockImplementationOnce(async request => {
        const row = await findCurrent(request);
        checkingCommit = true;
        return row;
      });

    // Let the writer's first check pass, then cancel as it prepares the projection.
    const isCurrent = () => {
      if (!checkingCommit) return true;
      commitChecks += 1;
      return commitChecks === 1;
    };
    await expect(accountingRebuildService.rebuildIntent(claim, isCurrent)).resolves.toBe(
      'deferred',
    );
    expect(await balanceRebuildIntentRepository.listPending()).toEqual([claim]);

    await queue.flush();
    expect(await balanceRebuildIntentRepository.listPending()).toEqual([]);
  });

  it('continues retrying deferred work at the capped delay', async () => {
    await stage(100);
    const pending = await balanceRebuildIntentRepository.listPending();
    jest.useFakeTimers();
    jest.spyOn(balanceRebuildIntentRepository, 'listPending').mockResolvedValue(pending);
    const rebuild = jest
      .spyOn(accountingRebuildService, 'rebuildIntent')
      .mockResolvedValue('deferred');

    await queue.flush();
    let attempts = 1;
    for (const delay of [2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]) {
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(rebuild).toHaveBeenCalledTimes(attempts);
      await jest.advanceTimersByTimeAsync(1);
      attempts += 1;
      expect(rebuild).toHaveBeenCalledTimes(attempts);
    }
  });

  it('replays both legacy records without clearing them before a successful import', async () => {
    const key = `${workplaceId}__${accountId}`;
    storage.set(legacyQueue, JSON.stringify([[key, 300]]));
    storage.set(legacyProcessing, JSON.stringify([[key, 100]]));
    jest
      .spyOn(balanceRebuildIntentRepository, 'importPending')
      .mockRejectedValueOnce(new Error('unavailable'));
    await queue.flush();
    expect(storage.getString(legacyQueue)).toBeDefined();
    expect(storage.getString(legacyProcessing)).toBeDefined();

    const rebuild = jest
      .spyOn(accountingRebuildService, 'rebuildIntent')
      .mockResolvedValue('deferred');
    await queue.flush();
    expect(rebuild).toHaveBeenCalledWith(
      expect.objectContaining({ accountId, fromDate: 100 }),
      expect.any(Function),
    );
    expect(storage.getString(legacyQueue)).toBeUndefined();
    expect(storage.getString(legacyProcessing)).toBeUndefined();
    expect(await balanceRebuildIntentRepository.listPending()).toHaveLength(1);
  });
});
