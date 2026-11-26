import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import {
  getStagedPersonAccounts,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import type Account from '@/src/data/models/Account';
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

export async function syncPutJournalPeopleInSession(input: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalId: JournalId;
  status: JournalStatus;
  accountsById: ReadonlyMap<AccountId, Account>;
  beforeTransactions: readonly Transaction[];
  newLines: readonly JournalWriteLine[];
}): Promise<void> {
  const { session, workplaceId, journalId, status, accountsById, beforeTransactions, newLines } =
    input;
  const [persistedLinks, existingItems, settlementAllocations] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId),
    personQueryRepository.listOpenItems(workplaceId, { originatingJournalId: journalId }),
    personQueryRepository.listSettlementAllocations(workplaceId, {
      settlementJournalId: journalId,
      activeOnly: true,
    }),
  ]);
  const links = [...persistedLinks, ...getStagedPersonAccounts(session, workplaceId)];
  const linksByAccount = new Map(links.map(link => [link.accountId, link]));
  const touched = [
    ...beforeTransactions.map(line => line.accountId),
    ...newLines.map(line => line.accountId),
  ];
  if (
    !touched.some(id => linksByAccount.has(id)) &&
    !existingItems.length &&
    !settlementAllocations.length
  )
    return;
  const itemIds = new Set(existingItems.map(item => item.id));
  const activeAllocations = await personQueryRepository.listSettlementAllocations(workplaceId, {
    activeOnly: true,
  });
  const relevantAllocations = activeAllocations.filter(
    a => itemIds.has(a.openItemId) || a.settlementJournalId === journalId,
  );
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
    settlementJournalId: settlementAllocations.length ? journalId : undefined,
  });
  if (!integrity.allowed)
    throw new Error('Cannot update journal: ' + integrity.conflicts.map(c => c.code).join(', '));
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

export async function guardAndSyncJournalDeleteOrReverseInSession(input: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalIds: readonly JournalId[];
  action: 'delete' | 'reverse';
}): Promise<void> {
  for (const journalId of input.journalIds) {
    const [items, allocations] = await Promise.all([
      personQueryRepository.listOpenItems(input.workplaceId, { originatingJournalId: journalId }),
      personQueryRepository.listSettlementAllocations(input.workplaceId, { activeOnly: true }),
    ]);
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
        active: a.isActive,
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
    );
    await personWriteRepository.deactivateSettlementAllocationsInSession(
      input.session,
      input.workplaceId,
      result.allocationsToDeactivate,
    );
  }
}
