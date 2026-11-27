import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import {
  getStagedPersonAccounts,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import type Account from '@/src/data/models/Account';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';
import Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import {
  evaluateJournalDeleteOrReverseIntegrity,
  evaluateJournalEditIntegrity,
  classifyPersonDebtPosting,
} from '@/src/domain/people';
import type { IntegrityPosting } from '@/src/domain/people/personJournalIntegrity';
import { AccountType, JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { JournalWriteLine } from '@/src/types/journalWrite';
import { database } from '@/src/data/database/Database';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '@/src/data/repositories/fetchSequentiallyInChunks';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';

export async function syncPutJournalPeopleInSession(input: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalId: JournalId;
  status: JournalStatus;
  accountsById: ReadonlyMap<AccountId, Account>;
  beforeTransactions: readonly Transaction[];
  newLines: readonly JournalWriteLine[];
  isReversal?: boolean;
  allocatePlannedRepayment?: boolean;
  skipOpenItemSync?: boolean;
}): Promise<void> {
  const { session, workplaceId, journalId, status, accountsById, beforeTransactions, newLines } =
    input;
  const touched = [
    ...beforeTransactions.map(line => line.accountId),
    ...newLines.map(line => line.accountId),
  ];
  const [persistedLinks, existingItems, settlementAllocations] = await Promise.all([
    personQueryRepository.listPersonAccountsForAccounts(workplaceId, touched),
    personQueryRepository.listOpenItems(workplaceId, { originatingJournalId: journalId }),
    personQueryRepository.listSettlementAllocations(workplaceId, {
      settlementJournalId: journalId,
      activeOnly: true,
    }),
  ]);
  const links = [...persistedLinks, ...getStagedPersonAccounts(session, workplaceId)];
  const linksByAccount = new Map(links.map(link => [link.accountId, link]));
  if (
    !touched.some(id => linksByAccount.has(id)) &&
    !existingItems.length &&
    !settlementAllocations.length
  )
    return;
  const itemAllocations = await personQueryRepository.listActiveAllocationsForItems(
    workplaceId,
    existingItems.map(item => item.id),
  );
  const relevantAllocations = [
    ...new Map([...itemAllocations, ...settlementAllocations].map(a => [a.id, a])).values(),
  ];
  const missing = [
    ...new Set(beforeTransactions.map(t => t.accountId).filter(id => !accountsById.has(id))),
  ];
  const fetched = missing.length
    ? await database.collections
        .get<Account>('accounts')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('id', Q.oneOf(missing)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch()
    : [];
  const accounts = new Map<AccountId, Account>(accountsById);
  fetched.forEach(a => accounts.set(a.id, a));
  const posting = (
    accountId: AccountId,
    transactionType: Transaction['transactionType'],
    amount: number,
    originatingJournalId: JournalId,
  ): IntegrityPosting | null => {
    const account = accounts.get(accountId);
    return account
      ? {
          accountId,
          accountType: account.accountType,
          transactionType,
          amount,
          originatingJournalId,
        }
      : null;
  };
  const beforeLines = beforeTransactions
    .map(t => posting(t.accountId, t.transactionType, t.amount, journalId))
    .filter((x): x is IntegrityPosting => x !== null);
  const proposedLines =
    status === JournalStatus.POSTED
      ? newLines
          .map(l => posting(l.accountId, l.transactionType, l.amount, journalId))
          .filter((x): x is IntegrityPosting => x !== null)
      : [];
  const integrity = evaluateJournalEditIntegrity({
    journalId,
    items: existingItems.map(i => ({
      id: i.id,
      personId: i.personId,
      accountId: i.accountId,
      originatingJournalId: i.originatingJournalId,
      currencyCode: i.currencyCode,
      originalAmount: i.originalAmount,
    })),
    allocations: relevantAllocations.map(a => ({
      id: a.id,
      openItemId: a.openItemId,
      journalId: a.settlementJournalId,
      amount: a.amount,
      active: a.isActive,
    })),
    beforeLines,
    proposedLines,
    settlementJournalId:
      status === JournalStatus.POSTED && settlementAllocations.length ? journalId : undefined,
  });
  if (!integrity.allowed)
    throw new Error('Cannot update journal: ' + integrity.conflicts.map(c => c.code).join(', '));
  for (const accountId of new Set(
    status === JournalStatus.POSTED ? settlementAllocations.map(a => a.accountId) : [],
  )) {
    const account = accounts.get(accountId);
    if (!account) throw new Error('Settlement account not found');
    const precision = getCurrencyPrecision(account.currencyCode);
    const allocated = settlementAllocations
      .filter(a => a.accountId === accountId)
      .reduce((sum, a) => sum + toMinorUnits(a.amount, precision), 0);
    const reducing = proposedLines
      .filter(
        line => line.accountId === accountId && classifyPersonDebtPosting(line) === 'reducing',
      )
      .reduce((sum, line) => sum + toMinorUnits(line.amount, precision), 0);
    if (allocated > reducing) throw new Error('Cannot update journal: settlement_overallocated');
  }
  if (status !== JournalStatus.POSTED) {
    await personWriteRepository.softDeleteOpenItemsInSession(
      session,
      workplaceId,
      existingItems.map(i => i.id),
    );
    await personWriteRepository.deactivateSettlementAllocationsInSession(
      session,
      workplaceId,
      settlementAllocations.map(a => a.id),
    );
    return;
  }
  if (input.allocatePlannedRepayment && settlementAllocations.length === 0) {
    const repayments = new Map<AccountId, number>();
    for (const line of newLines) {
      const account = accounts.get(line.accountId);
      if (
        !account ||
        !linksByAccount.has(account.id) ||
        classifyPersonDebtPosting({
          accountType: account.accountType,
          transactionType: line.transactionType,
        }) !== 'reducing'
      )
        continue;
      const precision = getCurrencyPrecision(account.currencyCode);
      repayments.set(
        account.id,
        (repayments.get(account.id) ?? 0) + toMinorUnits(line.amount, precision),
      );
    }
    for (const [accountId, amountUnits] of repayments) {
      const account = accounts.get(accountId)!;
      const link = linksByAccount.get(accountId)!;
      const items = await personQueryRepository.listOpenItems(workplaceId, {
        personId: link.personId,
        accountId: account.id,
      });
      const activeAllocations = await personQueryRepository.listActiveAllocationsForItems(
        workplaceId,
        items.map(item => item.id),
      );
      const precision = getCurrencyPrecision(account.currencyCode);
      let remaining = amountUnits;
      const originJournals = await fetchSequentiallyInChunks(
        [...new Set(items.map(item => item.originatingJournalId))],
        ids =>
          database.collections
            .get<Journal>('journals')
            .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf([...ids])))
            .fetch(),
      );
      const originDates = new Map(originJournals.map(journal => [journal.id, journal.journalDate]));
      const writes: {
        personId: typeof link.personId;
        openItemId: OpenItem['id'];
        settlementJournalId: JournalId;
        accountId: AccountId;
        allocationKind: 'repayment';
        amount: number;
      }[] = [];
      for (const item of items.sort(
        (a, b) =>
          (originDates.get(a.originatingJournalId) ?? a.createdAt.getTime()) -
            (originDates.get(b.originatingJournalId) ?? b.createdAt.getTime()) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )) {
        const allocated = activeAllocations
          .filter(a => a.openItemId === item.id)
          .reduce((sum, a) => sum + toMinorUnits(a.amount, precision), 0);
        const amount = Math.min(
          remaining,
          Math.max(0, toMinorUnits(item.originalAmount, precision) - allocated),
        );
        if (amount > 0)
          writes.push({
            personId: link.personId,
            openItemId: item.id,
            settlementJournalId: journalId,
            accountId: account.id,
            allocationKind: 'repayment',
            amount: fromMinorUnits(amount, precision),
          });
        remaining -= amount;
        if (!remaining) break;
      }
      await personWriteRepository.createSettlementAllocationsInSession(
        session,
        workplaceId,
        writes,
      );
    }
  }
  if (input.isReversal || input.skipOpenItemSync) return;
  const increasing = new Set<string>();
  for (const line of newLines) {
    const account = accounts.get(line.accountId),
      link = linksByAccount.get(line.accountId);
    if (
      !account ||
      !link ||
      (account.accountType !== AccountType.ASSET &&
        account.accountType !== AccountType.LIABILITY) ||
      classifyPersonDebtPosting({
        accountType: account.accountType,
        transactionType: line.transactionType,
      }) !== 'increasing'
    )
      continue;
    if (increasing.has(line.accountId))
      throw new Error('A journal can have only one debt-increasing posting per person account');
    increasing.add(line.accountId);
    await personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
      personId: link.personId,
      originatingJournalId: journalId,
      accountId: line.accountId,
      direction: account.accountType === AccountType.ASSET ? 'receivable' : 'payable',
      originalAmount: line.amount,
      currencyCode: account.currencyCode,
    });
  }
  await personWriteRepository.softDeleteOpenItemsInSession(
    session,
    workplaceId,
    existingItems.filter(i => !increasing.has(i.accountId)).map(i => i.id),
  );
}

export async function restoreJournalPeopleInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
  deletedAt: number,
): Promise<void> {
  if (!journalIds.length) return;
  const items = await fetchSequentiallyInChunks(journalIds, ids =>
    database.collections
      .get<OpenItem>('open_items')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('originating_journal_id', Q.oneOf([...ids])),
        Q.where('deleted_at', deletedAt),
      )
      .fetch(),
  );
  const allocations = await fetchSequentiallyInChunks(journalIds, ids =>
    database.collections
      .get<SettlementAllocation>('settlement_allocations')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('settlement_journal_id', Q.oneOf([...ids])),
        Q.where('is_active', false),
        Q.where('updated_at', deletedAt),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch(),
  );
  const [historicalItems, historicalAllocations] = await Promise.all([
    fetchSequentiallyInChunks(journalIds, ids =>
      database.collections
        .get<OpenItem>('open_items')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('originating_journal_id', Q.oneOf([...ids])),
          Q.where('deleted_at', Q.notEq(null)),
        )
        .fetch(),
    ),
    fetchSequentiallyInChunks(journalIds, ids =>
      database.collections
        .get<SettlementAllocation>('settlement_allocations')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('settlement_journal_id', Q.oneOf([...ids])),
          Q.where('is_active', false),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    ),
  ]);
  for (const journalId of journalIds) {
    if (
      (historicalItems.some(item => item.originatingJournalId === journalId) &&
        !items.some(item => item.originatingJournalId === journalId)) ||
      (historicalAllocations.some(allocation => allocation.settlementJournalId === journalId) &&
        !allocations.some(allocation => allocation.settlementJournalId === journalId))
    ) {
      throw new Error(
        'Cannot restore this older journal automatically because its People history needs review.',
      );
    }
  }
  const itemIds = allocations.map(allocation => allocation.openItemId);
  const [allItems, activeAllocations] = await Promise.all([
    personQueryRepository.listOpenItemsByIds(workplaceId, itemIds),
    personQueryRepository.listActiveAllocationsForItems(workplaceId, itemIds),
  ]);
  const itemById = new Map([...allItems, ...items].map(item => [item.id, item]));
  for (const allocation of allocations) {
    const item = itemById.get(allocation.openItemId);
    if (!item) throw new Error('Cannot restore repayment because its open item is unavailable');
    const precision = getCurrencyPrecision(item.currencyCode);
    const total = [...activeAllocations, ...allocations]
      .filter(a => a.openItemId === item.id)
      .reduce((sum, a) => sum + toMinorUnits(a.amount, precision), 0);
    if (total > toMinorUnits(item.originalAmount, precision)) {
      throw new Error('Cannot restore repayment because the open item has since been settled');
    }
  }
  const now = new Date();
  stageModelWrite(session, () => [
    ...items.map(item =>
      item.prepareUpdate(row => {
        row.deletedAt = undefined;
        row.updatedAt = now;
      }),
    ),
    ...allocations.map(allocation =>
      allocation.prepareUpdate(row => {
        row.isActive = true;
        row.updatedAt = now;
      }),
    ),
  ]);
}

export async function guardAndSyncJournalDeleteOrReverseInSession(input: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalIds: readonly JournalId[];
  action: 'delete' | 'reverse';
  deletedAt?: Date;
}): Promise<void> {
  const allItems = await personQueryRepository.listOpenItemsForJournals(
    input.workplaceId,
    input.journalIds,
  );
  const [itemAllocations, journalAllocations] = await Promise.all([
    personQueryRepository.listActiveAllocationsForItems(
      input.workplaceId,
      allItems.map(item => item.id),
    ),
    personQueryRepository.listActiveAllocationsForJournals(input.workplaceId, input.journalIds),
  ]);
  const allocations = [
    ...new Map([...itemAllocations, ...journalAllocations].map(a => [a.id, a])).values(),
  ];
  for (const journalId of input.journalIds) {
    const items = allItems.filter(item => item.originatingJournalId === journalId);
    const itemIds = new Set(items.map(i => i.id));
    const relevant = allocations.filter(
      a => itemIds.has(a.openItemId) || a.settlementJournalId === journalId,
    );
    const result = evaluateJournalDeleteOrReverseIntegrity({
      journalId,
      items: items.map(i => ({
        id: i.id,
        personId: i.personId,
        accountId: i.accountId,
        originatingJournalId: i.originatingJournalId,
        currencyCode: i.currencyCode,
        originalAmount: i.originalAmount,
      })),
      allocations: relevant.map(a => ({
        id: a.id,
        openItemId: a.openItemId,
        journalId: a.settlementJournalId,
        amount: a.amount,
        active:
          a.isActive &&
          !(
            input.action === 'delete' &&
            a.settlementJournalId !== journalId &&
            input.journalIds.includes(a.settlementJournalId)
          ),
      })),
      action: input.action,
    });
    if (!result.allowed)
      throw new Error(
        'Cannot ' + input.action + ' journal while People allocations reference its open items.',
      );
    await personWriteRepository.softDeleteOpenItemsInSession(
      input.session,
      input.workplaceId,
      items.map(i => i.id),
      input.deletedAt,
    );
    await personWriteRepository.deactivateSettlementAllocationsInSession(
      input.session,
      input.workplaceId,
      result.allocationsToDeactivate,
      input.deletedAt,
    );
  }
}
