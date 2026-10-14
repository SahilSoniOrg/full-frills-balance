import { importRepository } from '@/src/data/repositories/ImportRepository';
import { SNAPSHOT_TABLES, type WorkplaceSnapshot } from '@/src/services/backup/workplaceSnapshot';
import { snapshotFingerprint } from '@/src/services/backup/encryptedSnapshot';
import { keyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import { LocalKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import type { BatchImportData } from '@/src/types/importContracts';
import { JournalStatus } from '@/src/types/enums';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';

export const DEMO = asWorkplaceId('demo_workspace');
export const USER = 'native-proof-user';
export const SOURCE_DEVICE = 'native-proof-source';
export const keys = new LocalKeyHierarchy(keyCiphertextStateStore, assertE2eHarnessEnabled);
export function requireProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function expectRejection(work: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;
  try {
    await work();
  } catch {
    rejected = true;
  }
  requireProof(rejected, `${label} was incorrectly accepted`);
}

export async function dataFingerprint(
  snapshot: WorkplaceSnapshot,
  source?: WorkplaceSnapshot,
): Promise<string> {
  const data = Object.fromEntries(
    SNAPSHOT_TABLES.map(({ key }) => {
      const ids = source ? new Set((source.data[key] ?? []).map(row => row.id)) : undefined;
      const rows = [...(snapshot.data[key] ?? [])]
        .filter(row => !ids || ids.has(row.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      return [key, rows];
    }),
  );
  return snapshotFingerprint(JSON.stringify(data));
}

export async function expandDemoBooks(source: WorkplaceSnapshot, count: number): Promise<void> {
  assertE2eHarnessEnabled();
  const template = source.data.journals.find(
    journal =>
      journal.status === JournalStatus.POSTED &&
      !journal.originalJournalId &&
      !journal.reversingJournalId &&
      !journal.plannedPaymentId,
  );
  requireProof(template, 'Demo has no independent posted journal to expand');
  const sourceLines = source.data.transactions.filter(
    line => line.journalId === template.id && !line.deletedAt,
  );
  // Imports carry their complete account graph. Give the load entries their own accounts,
  // rather than depending on accounts outside this imported batch.
  const accountIds = new Set<string>(sourceLines.map(line => line.accountId));
  const accountMap = new Map<string, ReturnType<typeof asAccountId>>(
    [...accountIds].map(id => [id, asAccountId(generator())]),
  );
  const accounts = source.data.accounts
    .filter(account => accountIds.has(account.id))
    .map(account => ({
      ...account,
      id: accountMap.get(account.id)!,
      name: `Recovery load fixture ${account.name}`,
      parentAccountId: account.parentAccountId
        ? accountMap.get(account.parentAccountId)
        : undefined,
    }));
  const data: BatchImportData = { accounts, journals: [], transactions: [] };
  for (let index = 0; index < count; index++) {
    const id = asJournalId(generator());
    data.journals.push({ ...template, id, description: 'Disposable recovery load fixture' });
    data.transactions.push(
      ...sourceLines.map(line => ({
        ...line,
        id: generator(),
        journalId: id,
        accountId: accountMap.get(line.accountId)!,
      })),
    );
  }
  await importRepository.batchInsert(DEMO, data);
}
