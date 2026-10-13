import { webcrypto } from 'node:crypto';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { seedJournalPersistenceWriteFixtures } from '@/src/data/repositories/journal/__tests__/journalPersistenceTest.helpers';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { JournalStatus } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { captureWorkplaceSnapshot } from '../workplaceSnapshot';

export function enableTestCrypto(): void {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

export async function seedSnapshotWorkplace() {
  const workplaceId = asWorkplaceId('snapshot-workplace');
  await workplaceRepository.create({
    id: workplaceId,
    name: 'Private books',
    icon: Icon.Wallet,
    defaultCurrencyCode: 'USD',
  });
  const fixture = await seedJournalPersistenceWriteFixtures(workplaceId);
  const journal = await journalPersistenceRepository.put(
    fixture.putInput({ status: JournalStatus.POSTED }),
    workplaceId,
  );
  return {
    workplaceId,
    fixture,
    journal: journal.journal,
    snapshot: await captureWorkplaceSnapshot(workplaceId),
  };
}
