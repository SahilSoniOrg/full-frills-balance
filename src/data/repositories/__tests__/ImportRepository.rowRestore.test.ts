import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import type { BatchImportData } from '@/src/types/importContracts';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { WorkplaceId } from '@/src/types/ids';

const workplace = (id: string) => ({
  id: id as WorkplaceId,
  name: 'Restored ledger',
  icon: Icon.Briefcase,
  defaultCurrencyCode: 'USD',
});

const data = (...ids: string[]) => ({
  accounts: ids.map(id => ({
    id,
    name: `Account ${id}`,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  })),
  journals: [],
  transactions: [],
  auditLogs: [],
});

const receiptA = 'a'.repeat(64);
const receiptB = 'b'.repeat(64);

describe('ImportRepository.batchInsertRowRestore', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('publishes the receipt and preserves imported IDs without adding audit records', async () => {
    const restoreData: BatchImportData = {
      ...data('restore-account'),
      auditLogs: [
        {
          id: 'imported-audit',
          entityType: 'account',
          entityId: 'restore-account',
          action: 'CREATE',
          changes: '{}',
          timestamp: 1,
        },
      ],
    };
    const restored = await importRepository.batchInsertRowRestore(
      workplace('restore-wp'),
      restoreData,
      receiptA,
    );

    expect(restored.id).toBe('restore-wp');
    expect(restored.rowRestoreManifestHash).toBe(receiptA);
    const accounts = await database.collections.get<Account>('accounts').query().fetch();
    expect(accounts.map(account => account.id)).toEqual(['restore-account']);
    const auditLogs = await database.collections.get('audit_logs').query().fetch();
    expect(auditLogs.map(record => record.id)).toEqual(['imported-audit']);
  });

  it('treats the same Workplace and receipt as an idempotent no-op', async () => {
    const first = await importRepository.batchInsertRowRestore(
      workplace('restore-wp'),
      data('original-account'),
      receiptA,
    );
    const second = await importRepository.batchInsertRowRestore(
      workplace('restore-wp'),
      data('must-not-be-inserted'),
      receiptA.toUpperCase(),
    );

    expect(second.id).toBe(first.id);
    expect(await database.collections.get<Account>('accounts').query().fetchCount()).toBe(1);
    expect(await database.collections.get('workplaces').query().fetchCount()).toBe(1);
  });

  it('publishes the completion handoff with the receipt and keeps it unchanged on an exact retry', async () => {
    const original = {
      ...workplace('handoff-wp'),
      rowRestoreCompletionJson: '{"attempt":"original"}',
    };
    const restored = await importRepository.batchInsertRowRestore(
      original,
      data('account'),
      receiptA,
    );
    expect(restored.rowRestoreManifestHash).toBe(receiptA);
    expect(restored.rowRestoreCompletionJson).toBe(original.rowRestoreCompletionJson);
    const retried = await importRepository.batchInsertRowRestore(
      { ...original, rowRestoreCompletionJson: '{"attempt":"replacement"}' },
      data('other'),
      receiptA,
    );
    expect(retried.rowRestoreCompletionJson).toBe(original.rowRestoreCompletionJson);
    expect(await database.get('accounts').query().fetchCount()).toBe(1);
  });

  it('refuses a different receipt for an existing Workplace without changing it', async () => {
    await importRepository.batchInsertRowRestore(
      workplace('restore-wp'),
      data('original'),
      receiptA,
    );

    await expect(
      importRepository.batchInsertRowRestore(
        workplace('restore-wp'),
        data('replacement'),
        receiptB,
      ),
    ).rejects.toThrow(/different local Workplace/);

    const accounts = await database.collections.get<Account>('accounts').query().fetch();
    expect(accounts.map(account => account.id)).toEqual(['original']);
    expect(await database.collections.get('workplaces').query().fetchCount()).toBe(1);
  });

  it('refuses any imported primary-ID collision before publishing any row', async () => {
    await importRepository.batchInsert('local-wp' as WorkplaceId, data('already-present'));

    await expect(
      importRepository.batchInsertRowRestore(
        workplace('restore-wp'),
        data('new-before-collision', 'already-present'),
        receiptA,
      ),
    ).rejects.toThrow(/identity collision/);

    expect(await database.collections.get('workplaces').query().fetchCount()).toBe(0);
    const accounts = await database.collections.get<Account>('accounts').query().fetch();
    expect(accounts.map(account => account.id)).toEqual(['already-present']);
  });

  it('rejects malformed receipts and honors cancellation before entering publication', async () => {
    await expect(
      importRepository.batchInsertRowRestore(workplace('restore-wp'), data(), 'not-a-hash'),
    ).rejects.toThrow(/manifest hash/);

    const controller = new AbortController();
    controller.abort();
    await expect(
      importRepository.batchInsertRowRestore(
        workplace('restore-wp'),
        data(),
        receiptA,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(await database.collections.get('workplaces').query().fetchCount()).toBe(0);
  });

  it('honors cancellation while publication is waiting behind another writer', async () => {
    let releaseWriter!: () => void;
    let writerStarted!: () => void;
    const started = new Promise<void>(resolve => {
      writerStarted = resolve;
    });
    const blocked = new Promise<void>(resolve => {
      releaseWriter = resolve;
    });
    const writer = database.write(async () => {
      writerStarted();
      await blocked;
    });
    await started;
    const controller = new AbortController();
    const publication = importRepository.batchInsertRowRestore(
      workplace('restore-wp'),
      data('cancelled-account'),
      receiptA,
      controller.signal,
    );
    const rejected = expect(publication).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    releaseWriter();
    await writer;
    await rejected;
    expect(await database.collections.get('workplaces').query().fetchCount()).toBe(0);
    expect(await database.collections.get('accounts').query().fetchCount()).toBe(0);
  });
});
