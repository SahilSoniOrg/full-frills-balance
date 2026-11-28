import { database } from '@/src/data/database/Database';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { personObserveQueries } from '@/src/data/repositories/people/PersonObserveQueries';
import { personQueryRepository } from '@/src/data/repositories/people/PersonQueryRepository';
import { personWriteRepository } from '@/src/data/repositories/people/PersonWriteRepository';
import { observeAfterInitial } from '@/src/testing/observeAfterInitial';
import { resetDatabase } from '@/src/testing/resetDatabase';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';

const wp = 'wp-1' as WorkplaceId;
const account = 'account-1' as AccountId;
const journal = 'journal-1' as JournalId;

describe('PersonRepository', () => {
  beforeEach(async () => resetDatabase());

  it('creates, updates, archives, and unarchives people in accounting sessions', async () => {
    const person = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, { name: 'Ada' }),
    );
    await runAccountingWriteSession(session =>
      personWriteRepository.updatePersonInSession(session, wp, person.id, { name: 'Ada Lovelace' }),
    );
    await runAccountingWriteSession(session =>
      personWriteRepository.setPersonArchivedInSession(session, wp, person.id, true),
    );
    expect((await personQueryRepository.findPerson(wp, person.id))?.archivedAt).toBeTruthy();
    await runAccountingWriteSession(session =>
      personWriteRepository.setPersonArchivedInSession(session, wp, person.id, false),
    );
    expect(await personQueryRepository.listPeople(wp)).toHaveLength(1);
    expect(await database.collections.get('audit_logs').query().fetchCount()).toBe(4);
  });

  it('enforces one active person per account and can soft-unlink so another person can claim it', async () => {
    const [a, b] = await runAccountingWriteSession(async session => [
      await personWriteRepository.createPersonInSession(session, wp, { name: 'A' }),
      await personWriteRepository.createPersonInSession(session, wp, { name: 'B' }),
    ]);
    await runAccountingWriteSession(session =>
      personWriteRepository.linkAccountInSession(session, wp, a.id, account),
    );
    await expect(
      runAccountingWriteSession(session =>
        personWriteRepository.linkAccountInSession(session, wp, b.id, account),
      ),
    ).rejects.toThrow(/already linked/);
    await runAccountingWriteSession(session =>
      personWriteRepository.unlinkAccountInSession(session, wp, a.id, account),
    );
    expect(await personQueryRepository.listPersonAccounts(wp, a.id)).toHaveLength(0);
    await runAccountingWriteSession(session =>
      personWriteRepository.linkAccountInSession(session, wp, b.id, account),
    );
    expect(await personQueryRepository.listPersonAccounts(wp, b.id)).toHaveLength(1);
  });

  it('upserts open items by journal and account', async () => {
    const a = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, { name: 'A' }),
    );
    await runAccountingWriteSession(session =>
      personWriteRepository.linkAccountInSession(session, wp, a.id, account),
    );
    const input = {
      personId: a.id,
      originatingJournalId: journal,
      accountId: account,
      direction: 'receivable' as const,
      originalAmount: 100,
      currencyCode: 'USD',
    };
    const first = await runAccountingWriteSession(session =>
      personWriteRepository.upsertOpenItemInSession(session, wp, input),
    );
    const second = await runAccountingWriteSession(session =>
      personWriteRepository.upsertOpenItemInSession(session, wp, { ...input, originalAmount: 80 }),
    );
    expect(second.id).toBe(first.id);
    expect(await personQueryRepository.listOpenItems(wp)).toHaveLength(1);
  });

  it('creates and deactivates settlement allocations', async () => {
    const person = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, { name: 'A' }),
    );
    const item = await runAccountingWriteSession(session =>
      personWriteRepository.upsertOpenItemInSession(session, wp, {
        personId: person.id,
        originatingJournalId: journal,
        accountId: account,
        direction: 'receivable',
        originalAmount: 20,
        currencyCode: 'USD',
      }),
    );
    const [allocation] = await runAccountingWriteSession(session =>
      personWriteRepository.createSettlementAllocationsInSession(session, wp, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: 'journal-2' as JournalId,
          accountId: account,
          allocationKind: 'repayment',
          amount: 10,
        },
      ]),
    );
    await runAccountingWriteSession(session =>
      personWriteRepository.deactivateSettlementAllocationsInSession(session, wp, [allocation.id]),
    );
    expect(
      (await personQueryRepository.listSettlementAllocations(wp, { activeOnly: true })).length,
    ).toBe(0);
    expect((await personQueryRepository.listSettlementAllocations(wp))[0].isActive).toBe(false);
  });

  it('emits observer updates after writes', async () => {
    const person = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, { name: 'First' }),
    );
    const emissions = observeAfterInitial(personObserveQueries.observePeople(wp));
    await emissions.initial;
    await runAccountingWriteSession(session =>
      personWriteRepository.updatePersonInSession(session, wp, person.id, { name: 'Second' }),
    );
    expect((await emissions.nextValue)[0].name).toBe('Second');
  });

  it('persists enriched profile fields, enforces unique names, and sorts pinned people first', async () => {
    const zara = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, {
        name: '  Zara  ',
        color: '#10B981',
        defaultCurrencyCode: 'usd',
        paymentHandle: 'zara@upi',
        phone: '+91 90000 00000',
        email: 'zara@example.com',
        notes: 'Roommate',
        isPinned: true,
      }),
    );
    expect(zara.name).toBe('Zara');
    expect(zara.defaultCurrencyCode).toBe('USD');
    expect(zara.paymentHandle).toBe('zara@upi');
    expect(zara.phone).toBe('+91 90000 00000');
    expect(zara.email).toBe('zara@example.com');
    expect(zara.notes).toBe('Roommate');
    expect(zara.isPinned).toBe(true);

    const aaron = await runAccountingWriteSession(session =>
      personWriteRepository.createPersonInSession(session, wp, { name: 'Aaron' }),
    );
    expect((await personQueryRepository.listPeople(wp)).map(p => p.id)).toEqual([
      zara.id,
      aaron.id,
    ]);

    await expect(
      runAccountingWriteSession(session =>
        personWriteRepository.createPersonInSession(session, wp, { name: 'zara' }),
      ),
    ).rejects.toThrow(/already exists/);

    const updated = await runAccountingWriteSession(session =>
      personWriteRepository.updatePersonInSession(session, wp, zara.id, {
        notes: '   ',
        isPinned: false,
      }),
    );
    expect(updated.notes ?? undefined).toBeUndefined();
    expect(updated.isPinned).toBe(false);
    expect((await personQueryRepository.listPeople(wp)).map(p => p.id)).toEqual([
      aaron.id,
      zara.id,
    ]);
  });
});
