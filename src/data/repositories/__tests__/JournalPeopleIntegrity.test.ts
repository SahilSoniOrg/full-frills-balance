import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { JournalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { personQueryRepository } from '@/src/data/repositories/people/PersonQueryRepository';
import { personWriteRepository } from '@/src/data/repositories/people/PersonWriteRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';

const workplaceId = 'people-integrity' as WorkplaceId;
const repository = new JournalPersistenceRepository();

describe('Journal People integrity', () => {
  beforeEach(async () => resetDatabase());

  it('creates and preserves a Person open item on posted journal replacement', async () => {
    const receivable = await accountWriteRepository.create({
      workplaceId,
      name: 'Receivable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const equity = await accountWriteRepository.create({
      workplaceId,
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await runAccountingWriteSession(s =>
      personWriteRepository.createPersonInSession(s, workplaceId, { name: 'Ada' }),
    );
    await runAccountingWriteSession(s =>
      personWriteRepository.linkAccountInSession(s, workplaceId, person.id, receivable.id),
    );
    const lines = [
      { accountId: receivable.id, amount: 100, transactionType: TransactionType.DEBIT },
      { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
    ];
    const original = await repository.put(
      { journalDate: 1, currencyCode: 'USD', status: JournalStatus.POSTED, transactions: lines },
      workplaceId,
    );
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: original.journal.id,
    });
    expect(item).toBeTruthy();
    const [allocation] = await runAccountingWriteSession(s =>
      personWriteRepository.createSettlementAllocationsInSession(s, workplaceId, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: 'settlement' as never,
          accountId: receivable.id,
          allocationKind: 'repayment',
          amount: 20,
        },
      ]),
    );
    await repository.put(
      {
        journalId: original.journal.id,
        journalDate: 1,
        currencyCode: 'USD',
        status: JournalStatus.POSTED,
        transactions: [{ ...lines[0] }, { ...lines[1] }],
      },
      workplaceId,
    );
    const [preserved] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: original.journal.id,
    });
    expect(preserved.id).toBe(item.id);
    expect(
      (
        await personQueryRepository.listSettlementAllocations(workplaceId, {
          openItemId: item.id,
          activeOnly: true,
        })
      )[0].id,
    ).toBe(allocation.id);
  });

  it('blocks removal below active allocations and deletion of allocated origin journals', async () => {
    const receivable = await accountWriteRepository.create({
      workplaceId,
      name: 'Receivable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const equity = await accountWriteRepository.create({
      workplaceId,
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await runAccountingWriteSession(s =>
      personWriteRepository.createPersonInSession(s, workplaceId, { name: 'Ada' }),
    );
    await runAccountingWriteSession(s =>
      personWriteRepository.linkAccountInSession(s, workplaceId, person.id, receivable.id),
    );
    const journal = await repository.put(
      {
        journalDate: 1,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: journal.journal.id,
    });
    await runAccountingWriteSession(s =>
      personWriteRepository.createSettlementAllocationsInSession(s, workplaceId, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: 'settlement' as never,
          accountId: receivable.id,
          allocationKind: 'repayment',
          amount: 50,
        },
      ]),
    );
    await expect(
      repository.put(
        {
          journalId: journal.journal.id,
          journalDate: 1,
          currencyCode: 'USD',
          status: JournalStatus.POSTED,
          transactions: [
            { accountId: receivable.id, amount: 40, transactionType: TransactionType.DEBIT },
            { accountId: equity.id, amount: 40, transactionType: TransactionType.CREDIT },
          ],
        },
        workplaceId,
      ),
    ).rejects.toThrow(/Cannot update journal/);
    await expect(repository.delete(journal.journal.id, workplaceId)).rejects.toThrow(
      /Cannot delete journal/,
    );
    expect(
      (
        await personQueryRepository.listOpenItems(workplaceId, {
          originatingJournalId: journal.journal.id,
        })
      )[0].id,
    ).toBe(item.id);
    expect(await database.collections.get('settlement_allocations').query().fetchCount()).toBe(1);
  });

  it('deactivates settlement allocations when the settlement journal is deleted', async () => {
    const receivable = await accountWriteRepository.create({
      workplaceId,
      name: 'Receivable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const equity = await accountWriteRepository.create({
      workplaceId,
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await runAccountingWriteSession(s =>
      personWriteRepository.createPersonInSession(s, workplaceId, { name: 'Ada' }),
    );
    await runAccountingWriteSession(s =>
      personWriteRepository.linkAccountInSession(s, workplaceId, person.id, receivable.id),
    );
    const origin = await repository.put(
      {
        journalDate: 1,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
    const settlement = await repository.put(
      {
        journalDate: 2,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 30, transactionType: TransactionType.CREDIT },
          { accountId: equity.id, amount: 30, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceId,
    );
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: origin.journal.id,
    });
    const [allocation] = await runAccountingWriteSession(s =>
      personWriteRepository.createSettlementAllocationsInSession(s, workplaceId, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: settlement.journal.id,
          accountId: receivable.id,
          allocationKind: 'repayment',
          amount: 30,
        },
      ]),
    );
    await repository.delete(settlement.journal.id, workplaceId);
    expect(
      (
        await personQueryRepository.listSettlementAllocations(workplaceId, {
          openItemId: item.id,
          activeOnly: true,
        })
      ).length,
    ).toBe(0);
    expect(
      (
        await personQueryRepository.listSettlementAllocations(workplaceId, { openItemId: item.id })
      ).find(row => row.id === allocation.id)?.isActive,
    ).toBe(false);
  });

  it('deactivates settlement allocations when the settlement journal is reversed', async () => {
    const receivable = await accountWriteRepository.create({
      workplaceId,
      name: 'Receivable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const equity = await accountWriteRepository.create({
      workplaceId,
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await runAccountingWriteSession(s =>
      personWriteRepository.createPersonInSession(s, workplaceId, { name: 'Ada' }),
    );
    await runAccountingWriteSession(s =>
      personWriteRepository.linkAccountInSession(s, workplaceId, person.id, receivable.id),
    );
    const origin = await repository.put(
      {
        journalDate: 1,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
    const settlement = await repository.put(
      {
        journalDate: 2,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 30, transactionType: TransactionType.CREDIT },
          { accountId: equity.id, amount: 30, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceId,
    );
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: origin.journal.id,
    });
    await runAccountingWriteSession(s =>
      personWriteRepository.createSettlementAllocationsInSession(s, workplaceId, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: settlement.journal.id,
          accountId: receivable.id,
          allocationKind: 'repayment',
          amount: 30,
        },
      ]),
    );
    await repository.reverse(settlement.journal.id, 'Correction', workplaceId);
    expect(
      await personQueryRepository.listOpenItems(workplaceId, { personId: person.id }),
    ).toHaveLength(1);
    expect(
      await personQueryRepository.listSettlementAllocations(workplaceId, {
        openItemId: item.id,
        activeOnly: true,
      }),
    ).toHaveLength(0);
  });

  it('blocks reversal of an originating journal with active allocations', async () => {
    const receivable = await accountWriteRepository.create({
      workplaceId,
      name: 'Receivable',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const equity = await accountWriteRepository.create({
      workplaceId,
      name: 'Equity',
      accountType: AccountType.EQUITY,
      currencyCode: 'USD',
    });
    const person = await runAccountingWriteSession(s =>
      personWriteRepository.createPersonInSession(s, workplaceId, { name: 'Ada' }),
    );
    await runAccountingWriteSession(s =>
      personWriteRepository.linkAccountInSession(s, workplaceId, person.id, receivable.id),
    );
    const origin = await repository.put(
      {
        journalDate: 1,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 100, transactionType: TransactionType.DEBIT },
          { accountId: equity.id, amount: 100, transactionType: TransactionType.CREDIT },
        ],
      },
      workplaceId,
    );
    const settlement = await repository.put(
      {
        journalDate: 2,
        currencyCode: 'USD',
        transactions: [
          { accountId: receivable.id, amount: 30, transactionType: TransactionType.CREDIT },
          { accountId: equity.id, amount: 30, transactionType: TransactionType.DEBIT },
        ],
      },
      workplaceId,
    );
    const [item] = await personQueryRepository.listOpenItems(workplaceId, {
      originatingJournalId: origin.journal.id,
    });
    await runAccountingWriteSession(s =>
      personWriteRepository.createSettlementAllocationsInSession(s, workplaceId, [
        {
          personId: person.id,
          openItemId: item.id,
          settlementJournalId: settlement.journal.id,
          accountId: receivable.id,
          allocationKind: 'repayment',
          amount: 30,
        },
      ]),
    );
    await expect(
      repository.reverse(origin.journal.id, 'Correction', workplaceId),
    ).rejects.toThrow();
  });
});
