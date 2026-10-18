import { restoreCompletionRepository } from '../RestoreCompletionRepository';
import { importRepository } from '../ImportRepository';
import { workplaceRepository } from '../WorkplaceRepository';
import * as persistence from '@/src/data/database/flushPersistence';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { asWorkplaceId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';

beforeEach(resetDatabase);
afterEach(() => jest.restoreAllMocks());

async function publish() {
  await importRepository.batchInsertRowRestore(
    {
      id: asWorkplaceId('pending-workplace'),
      name: 'Pending books',
      icon: Icon.Wallet,
      defaultCurrencyCode: 'USD',
      rowRestoreCompletionJson: '{"handoff":"original"}',
    },
    { accounts: [], journals: [], transactions: [], auditLogs: [] },
    'a'.repeat(64),
  );
  return (await restoreCompletionRepository.readPending())[0];
}

it('retains the receipt after completing the pending handoff', async () => {
  const pending = await publish();
  const updatedAt = (await workplaceRepository.find(pending.workplaceId))!.updatedAt.getTime();
  await restoreCompletionRepository.clear(pending);
  expect(await restoreCompletionRepository.readPending()).toEqual([]);
  expect((await workplaceRepository.find(pending.workplaceId))!.rowRestoreManifestHash).toBe(
    pending.manifestHash,
  );
  expect((await workplaceRepository.find(pending.workplaceId))!.updatedAt.getTime()).toBe(
    updatedAt,
  );
});

it('restores the in-memory launch gate when persistence does not acknowledge completion', async () => {
  const pending = await publish();
  jest
    .spyOn(persistence, 'flushDatabasePersistence')
    .mockRejectedValueOnce(new Error('save failed'));
  await expect(restoreCompletionRepository.clear(pending)).rejects.toThrow('save failed');
  expect(await restoreCompletionRepository.readPending()).toEqual([pending]);
  await restoreCompletionRepository.clear(pending);
  expect(await restoreCompletionRepository.readPending()).toEqual([]);
});

it('refuses a stale completion acknowledgement', async () => {
  const pending = await publish();
  await expect(
    restoreCompletionRepository.clear({ ...pending, manifestHash: 'b'.repeat(64) }),
  ).rejects.toThrow('changed');
  expect(await restoreCompletionRepository.readPending()).toEqual([pending]);
});
