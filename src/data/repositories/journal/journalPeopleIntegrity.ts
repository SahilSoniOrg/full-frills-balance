import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import {
  getStagedPersonAccounts,
  getSessionOpenItems,
  getSessionOpenItemPatches,
  getSessionAllocations,
  getSessionInactiveAllocationIds,
  getSessionDeletedOpenItemIds,
  stageModelWrite,
  stageBalanceRebuildIntents,
  stagePeopleJournalDate,
  getStagedPeopleJournalDate,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import type Account from '@/src/data/models/Account';
import { isRepaymentJournal } from '@/src/domain/people/personRepaymentPolicy';
import { fetchJournalTransactions } from './journalPersistenceSupport';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from './journalQueryRepository';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';
import type Transaction from '@/src/data/models/Transaction';
import {
  evaluateJournalDeleteOrReverseIntegrity,
  evaluateJournalEditIntegrity,
  classifyPersonDebtPosting,
} from '@/src/domain/people';
import type { IntegrityPosting } from '@/src/domain/people/personJournalIntegrity';
import { AccountType, JournalStatus } from '@/src/types/enums';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import type { JournalWriteLine, JournalRepaymentAllocation } from '@/src/types/journalWrite';
import { database } from '@/src/data/database/Database';
import { Q } from '@nozbe/watermelondb';
import { fetchSequentiallyInChunks } from '@/src/data/repositories/fetchSequentiallyInChunks';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { allocatePersonRepaymentMinorUnits } from '@/src/domain/people/personRepaymentAllocation';

type OpenItemSnapshot = Pick<
  OpenItem,
  | 'id'
  | 'workplaceId'
  | 'personId'
  | 'originatingJournalId'
  | 'accountId'
  | 'originalAmount'
  | 'direction'
  | 'currencyCode'
  | 'createdAt'
  | 'deletedAt'
>;

function openItemsInSession(
  session: AccountingWriteSession,
  persisted: readonly OpenItem[],
  include: (row: OpenItemSnapshot) => boolean,
): OpenItemSnapshot[] {
  const rows = new Map<OpenItemId, OpenItemSnapshot>();
  for (const item of [...persisted, ...getSessionOpenItems(session)]) rows.set(item.id, item);
  for (const { item, patch } of getSessionOpenItemPatches(session).values()) {
    rows.set(item.id, {
      id: item.id,
      workplaceId: item.workplaceId,
      personId: (patch.personId as OpenItemSnapshot['personId'] | undefined) ?? item.personId,
      originatingJournalId:
        (patch.originatingJournalId as OpenItemSnapshot['originatingJournalId'] | undefined) ??
        item.originatingJournalId,
      accountId: (patch.accountId as OpenItemSnapshot['accountId'] | undefined) ?? item.accountId,
      currencyCode:
        (patch.currencyCode as OpenItemSnapshot['currencyCode'] | undefined) ?? item.currencyCode,
      originalAmount:
        (patch.originalAmount as OpenItemSnapshot['originalAmount'] | undefined) ??
        item.originalAmount,
      direction: (patch.direction as OpenItemSnapshot['direction'] | undefined) ?? item.direction,
      createdAt: item.createdAt,
      deletedAt: (patch.deletedAt as OpenItemSnapshot['deletedAt'] | undefined) ?? item.deletedAt,
    });
  }
  const deleted = getSessionDeletedOpenItemIds(session);
  return [...rows.values()].filter(row => !row.deletedAt && !deleted.has(row.id) && include(row));
}

function activeAllocationsInSession(
  session: AccountingWriteSession,
  persisted: readonly SettlementAllocation[],
  include: (row: SettlementAllocation) => boolean,
) {
  const inactive = getSessionInactiveAllocationIds(session);
  return [
    ...new Map(
      [...persisted, ...getSessionAllocations(session)].map(row => [row.id, row]),
    ).values(),
  ].filter(row => row.isActive && !inactive.has(row.id) && include(row));
}

type SyncInput = {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalId: JournalId;
  status: JournalStatus;
  accountsById: ReadonlyMap<AccountId, Account>;
  precisionByAccountId?: ReadonlyMap<AccountId, number>;
  beforeTransactions: readonly Transaction[];
  newLines: readonly JournalWriteLine[];
  isReversal?: boolean;
  allocatePlannedRepayment?: boolean;
  skipOpenItemSync?: boolean;
  repaymentAllocation?: JournalRepaymentAllocation;
  journalDate: number;
  previousJournalDate?: number;
  previousStatus?: JournalStatus;
  skipPeopleAutoSettlement?: boolean;
  triggerPeopleAutoSettlement?: boolean;
};

function financialLinesKey(
  rows: readonly {
    accountId: AccountId;
    amount: number;
    transactionType: string;
    exchangeRate?: number | null;
  }[],
) {
  return rows
    .map(row =>
      JSON.stringify([row.accountId, row.transactionType, row.amount, row.exchangeRate ?? 1]),
    )
    .sort()
    .join('|');
}

export async function syncPutJournalPeopleInSession(input: SyncInput): Promise<void> {
  const {
    session,
    workplaceId,
    journalId,
    status,
    beforeTransactions,
    newLines,
    repaymentAllocation,
  } = input;
  if (repaymentAllocation && (status !== JournalStatus.POSTED || input.isReversal))
    throw new Error(
      'Repayment allocations require a posted journal that is not part of a reversal',
    );

  stagePeopleJournalDate(session, journalId, input.journalDate);
  const touched = [...new Set([...beforeTransactions, ...newLines].map(line => line.accountId))];
  const [persistedLinks, queriedItems, queriedSettlements] = await Promise.all([
    personQueryRepository.listPersonAccountsForAccounts(workplaceId, touched),
    personQueryRepository.listOpenItems(workplaceId, { originatingJournalId: journalId }),
    personQueryRepository.listSettlementAllocations(workplaceId, {
      settlementJournalId: journalId,
      activeOnly: true,
    }),
  ]);
  const existingItems = openItemsInSession(
    session,
    queriedItems,
    row => row.workplaceId === workplaceId && row.originatingJournalId === journalId,
  );
  const settlementAllocations = activeAllocationsInSession(
    session,
    queriedSettlements,
    row => row.workplaceId === workplaceId && row.settlementJournalId === journalId,
  );
  const links = [...persistedLinks, ...getStagedPersonAccounts(session, workplaceId)];
  const linkByAccount = new Map(links.map(link => [link.accountId, link.personId]));
  const touchedPeopleAccounts = touched.filter(accountId => linkByAccount.has(accountId));
  if (!touchedPeopleAccounts.length && !existingItems.length && !settlementAllocations.length) {
    if (repaymentAllocation)
      throw new Error('Repayment target does not match a linked reducing posting');
    return;
  }

  const itemIds = new Set(existingItems.map(item => item.id));
  const missingIds = touched.filter(id => !input.accountsById.has(id));
  const [queriedAllocations, missingAccounts] = await Promise.all([
    personQueryRepository.listActiveAllocationsForItems(workplaceId, [...itemIds]),
    accountQueryRepository.findAllByIds(workplaceId, missingIds),
  ]);
  const itemAllocations = activeAllocationsInSession(
    session,
    queriedAllocations,
    row => row.workplaceId === workplaceId && itemIds.has(row.openItemId),
  );
  const availableAccounts = new Map(input.accountsById);
  for (const account of missingAccounts) availableAccounts.set(account.id, account);
  const precisionByAccount = new Map(input.precisionByAccountId);
  await Promise.all(
    [...availableAccounts].map(async ([id, account]) => {
      if (!precisionByAccount.has(id)) {
        precisionByAccount.set(id, await currencyRepository.getPrecision(account.currencyCode));
      }
    }),
  );

  const toPosting = (line: JournalWriteLine | Transaction): IntegrityPosting[] => {
    const account = availableAccounts.get(line.accountId);
    if (!account) return [];
    return [
      {
        accountId: account.id,
        accountType: account.accountType,
        transactionType: line.transactionType,
        amount: line.amount,
        precision: precisionByAccount.get(account.id),
        originatingJournalId: journalId,
      },
    ];
  };
  const beforeLines = beforeTransactions.flatMap(toPosting);
  const proposedLines = status === JournalStatus.POSTED ? newLines.flatMap(toPosting) : [];
  const allocations = [
    ...new Map([...itemAllocations, ...settlementAllocations].map(row => [row.id, row])).values(),
  ];
  const integrity = evaluateJournalEditIntegrity({
    journalId,
    items: existingItems.map(item => ({
      id: item.id,
      personId: item.personId,
      accountId: item.accountId,
      originatingJournalId: item.originatingJournalId,
      currencyCode: item.currencyCode,
      originalAmount: item.originalAmount,
      direction: item.direction,
      createdAt: item.createdAt?.getTime(),
    })),
    allocations: allocations.map(row => ({
      id: row.id,
      openItemId: row.openItemId,
      accountId: row.accountId,
      journalId: row.settlementJournalId,
      amount: row.amount,
      active: true,
    })),
    beforeLines,
    proposedLines,
    settlementJournalId:
      status === JournalStatus.POSTED && settlementAllocations.length ? journalId : undefined,
  });
  if (!integrity.allowed)
    throw new Error(
      'Cannot update journal: ' + integrity.conflicts.map(conflict => conflict.code).join(', '),
    );

  if (status !== JournalStatus.POSTED) {
    await personWriteRepository.softDeleteOpenItemsInSession(session, workplaceId, [...itemIds]);
    await personWriteRepository.deactivateSettlementAllocationsInSession(
      session,
      workplaceId,
      settlementAllocations.map(row => row.id),
    );
    return;
  }

  if (
    !input.isReversal &&
    !input.skipPeopleAutoSettlement &&
    touchedPeopleAccounts.length &&
    (input.triggerPeopleAutoSettlement ||
      input.previousStatus !== JournalStatus.POSTED ||
      input.previousJournalDate !== input.journalDate ||
      financialLinesKey(beforeTransactions) !== financialLinesKey(newLines))
  ) {
    stageBalanceRebuildIntents(
      session,
      workplaceId,
      touchedPeopleAccounts,
      Math.min(input.previousJournalDate ?? input.journalDate, input.journalDate),
      input.journalDate,
    );
  }
  if (repaymentAllocation && settlementAllocations.length)
    throw new Error(
      'This journal already has repayment allocations. Resolve them before changing the repayment.',
    );
  if (
    !input.isReversal &&
    !settlementAllocations.length &&
    (input.allocatePlannedRepayment || repaymentAllocation)
  ) {
    await allocateJournalRepayments(
      input,
      availableAccounts,
      precisionByAccount,
      proposedLines,
      linkByAccount,
    );
  }
  if (input.isReversal || input.skipOpenItemSync) return;

  const previouslyIncreasing = new Set(
    input.previousStatus === JournalStatus.POSTED
      ? beforeLines
          .filter(line => classifyPersonDebtPosting(line) === 'increasing')
          .map(line => line.accountId)
      : [],
  );
  const trackedByAccount = new Map(existingItems.map(item => [item.accountId, item]));
  const increasing = new Set<AccountId>();
  for (const line of newLines) {
    const account = availableAccounts.get(line.accountId);
    const personId = linkByAccount.get(line.accountId);
    if (
      !account ||
      !personId ||
      classifyPersonDebtPosting({
        accountType: account.accountType,
        transactionType: line.transactionType,
      }) !== 'increasing'
    )
      continue;

    const tracked = trackedByAccount.get(account.id);
    // Linking a historical account leaves its past activity unassigned.
    if (!tracked && previouslyIncreasing.has(account.id)) continue;
    if (increasing.has(account.id))
      throw new Error('A journal can have only one debt-increasing posting per person account');
    increasing.add(account.id);
    if (tracked?.originalAmount === line.amount && tracked.personId === personId) continue;
    await personWriteRepository.upsertOpenItemInSession(session, workplaceId, {
      personId,
      originatingJournalId: journalId,
      accountId: account.id,
      direction: account.accountType === AccountType.ASSET ? 'receivable' : 'payable',
      originalAmount: line.amount,
      currencyCode: account.currencyCode,
    });
  }
  await personWriteRepository.softDeleteOpenItemsInSession(
    session,
    workplaceId,
    existingItems.filter(row => !increasing.has(row.accountId)).map(row => row.id),
  );
}

async function allocateJournalRepayments(
  input: SyncInput,
  accounts: ReadonlyMap<AccountId, Account>,
  precisionByAccount: ReadonlyMap<AccountId, number>,
  postings: readonly IntegrityPosting[],
  linkByAccount: ReadonlyMap<AccountId, PersonId>,
) {
  const { session, workplaceId, journalId, repaymentAllocation } = input;
  const reducing = new Map<AccountId, number>();
  for (const accountId of linkByAccount.keys()) {
    const precision = precisionByAccount.get(accountId);
    if (precision === undefined) continue;
    const units = postings
      .filter(
        line => line.accountId === accountId && classifyPersonDebtPosting(line) === 'reducing',
      )
      .reduce((sum, line) => sum + toMinorUnits(line.amount, precision), 0);
    if (units > 0) reducing.set(accountId, units);
  }
  if (
    repaymentAllocation &&
    (!reducing.has(repaymentAllocation.targetAccountId) ||
      linkByAccount.get(repaymentAllocation.targetAccountId) !== repaymentAllocation.personId)
  )
    throw new Error('Repayment target does not match a linked reducing posting');

  for (const [accountId, amountMinor] of reducing) {
    if (repaymentAllocation && repaymentAllocation.targetAccountId !== accountId) continue;
    const account = accounts.get(accountId)!;
    const personId = linkByAccount.get(accountId)!;
    const precision = precisionByAccount.get(accountId)!;
    const persistedItems = await personQueryRepository.listOpenItems(workplaceId, {
      personId,
      accountId,
    });
    const items = openItemsInSession(
      session,
      persistedItems,
      row =>
        row.workplaceId === workplaceId &&
        row.accountId === accountId &&
        row.personId === personId &&
        row.currencyCode === account.currencyCode,
    );
    const itemIds = new Set(items.map(row => row.id));
    const [persistedAllocations, origins] = await Promise.all([
      personQueryRepository.listActiveAllocationsForItems(workplaceId, [...itemIds]),
      journalQueryRepository.findByIds(workplaceId, [
        ...new Set(items.map(item => item.originatingJournalId)),
      ]),
    ]);
    const allocatedByItem = new Map<OpenItemId, number>();
    for (const row of activeAllocationsInSession(
      session,
      persistedAllocations,
      row => row.workplaceId === workplaceId && itemIds.has(row.openItemId),
    )) {
      allocatedByItem.set(
        row.openItemId,
        (allocatedByItem.get(row.openItemId) ?? 0) + toMinorUnits(row.amount, precision),
      );
    }
    const originDates = new Map(origins.map(row => [row.id, row.journalDate]));
    for (const row of repaymentAllocation?.allocations ?? []) {
      const minor = toMinorUnits(row.amount, precision);
      if (
        !Number.isFinite(row.amount) ||
        Math.abs(fromMinorUnits(minor, precision) - row.amount) > 1e-8
      ) {
        throw new Error('Repayment allocation has invalid currency precision');
      }
    }
    const plan = allocatePersonRepaymentMinorUnits({
      amountMinor,
      items: items.map(item => ({
        openItemId: item.id,
        id: item.id,
        availableMinor: Math.max(
          0,
          toMinorUnits(item.originalAmount, precision) - (allocatedByItem.get(item.id) ?? 0),
        ),
        journalDate:
          getStagedPeopleJournalDate(session, item.originatingJournalId) ??
          originDates.get(item.originatingJournalId) ??
          item.createdAt.getTime(),
        createdAt: item.createdAt.getTime(),
      })),
      requestedAllocations:
        repaymentAllocation?.allocationMode === 'fifo'
          ? undefined
          : repaymentAllocation?.allocations.map(row => ({
              openItemId: row.openItemId,
              amountMinor: toMinorUnits(row.amount, precision),
            })),
    });
    await personWriteRepository.createSettlementAllocationsInSession(
      session,
      workplaceId,
      plan.allocations.map(row => ({
        personId,
        accountId,
        settlementJournalId: journalId,
        openItemId: row.openItemId,
        allocationKind: 'repayment',
        amount: fromMinorUnits(row.amountMinor, precision),
      })),
    );
  }
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
  const [laterDeletedItems, laterDeactivatedAllocations] = await Promise.all([
    fetchSequentiallyInChunks(journalIds, ids =>
      database.collections
        .get<OpenItem>('open_items')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('originating_journal_id', Q.oneOf([...ids])),
          Q.where('deleted_at', Q.gt(deletedAt)),
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
          Q.where('updated_at', Q.gt(deletedAt)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    ),
  ]);
  for (const journalId of journalIds) {
    if (
      (laterDeletedItems.some(item => item.originatingJournalId === journalId) &&
        !items.some(item => item.originatingJournalId === journalId)) ||
      (laterDeactivatedAllocations.some(
        allocation => allocation.settlementJournalId === journalId,
      ) &&
        !allocations.some(allocation => allocation.settlementJournalId === journalId))
    ) {
      throw new Error(
        'Cannot restore this older journal automatically because its People history needs review.',
      );
    }
  }
  await validateRestoredRepayments(session, workplaceId, items, allocations, deletedAt);
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

async function validateRestoredRepayments(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  restoredItems: OpenItem[],
  allocations: SettlementAllocation[],
  deletedAt: number,
) {
  if (!allocations.length) return;
  const journalIds = [...new Set(allocations.map(row => row.settlementJournalId))];
  const itemIds = [...new Set(allocations.map(row => row.openItemId))];
  const accountIds = [...new Set(allocations.map(row => row.accountId))];
  const [allItems, activeAllocations, journalAllocations, accounts, journals, transactions] =
    await Promise.all([
      personQueryRepository.listOpenItemsByIds(workplaceId, itemIds),
      personQueryRepository.listActiveAllocationsForItems(workplaceId, itemIds),
      personQueryRepository.listActiveAllocationsForJournals(workplaceId, journalIds),
      accountQueryRepository.findAllByIds(workplaceId, accountIds),
      fetchSequentiallyInChunks(journalIds, ids =>
        journalQueryRepository.findWithDeletedByIds(workplaceId, [...ids]),
      ),
      fetchJournalTransactions(workplaceId, journalIds, { includeDeleted: true }),
    ]);
  const itemIdSet = new Set(itemIds);
  const itemById = new Map(
    [
      ...openItemsInSession(
        session,
        allItems,
        row => row.workplaceId === workplaceId && itemIdSet.has(row.id),
      ),
      ...restoredItems,
    ].map(item => [item.id, item]),
  );
  const accountById = new Map(accounts.map(account => [account.id, account]));
  const eligibleJournals = new Set(journals.filter(isRepaymentJournal).map(journal => journal.id));
  const precisionByCurrency = await currencyRepository.getAllPrecisions();
  const precision = (code: string) => precisionByCurrency.get(code) ?? getCurrencyPrecision(code);
  const relevant = activeAllocationsInSession(
    session,
    activeAllocations,
    row => row.workplaceId === workplaceId && itemIdSet.has(row.openItemId),
  );
  const relevantJournalAllocations = activeAllocationsInSession(
    session,
    journalAllocations,
    row => row.workplaceId === workplaceId && journalIds.includes(row.settlementJournalId),
  );
  for (const row of allocations) {
    const item = itemById.get(row.openItemId);
    const account = accountById.get(row.accountId);
    if (
      !item ||
      !account ||
      item.personId !== row.personId ||
      item.accountId !== row.accountId ||
      account.currencyCode !== item.currencyCode ||
      !eligibleJournals.has(row.settlementJournalId)
    ) {
      throw new Error('Cannot restore repayment because its item or posting is unavailable');
    }
    const digits = precision(item.currencyCode);
    const itemTotal = [...relevant, ...allocations]
      .filter(other => other.openItemId === item.id)
      .reduce((sum, other) => sum + toMinorUnits(other.amount, digits), 0);
    const journalTotal = [...relevantJournalAllocations, ...allocations]
      .filter(
        other =>
          other.settlementJournalId === row.settlementJournalId &&
          other.accountId === row.accountId,
      )
      .reduce((sum, other) => sum + toMinorUnits(other.amount, digits), 0);
    const postingTotal = transactions
      .filter(
        tx =>
          tx.journalId === row.settlementJournalId &&
          tx.accountId === row.accountId &&
          (!tx.deletedAt || tx.deletedAt.getTime() === deletedAt) &&
          classifyPersonDebtPosting({
            accountType: account.accountType,
            transactionType: tx.transactionType,
          }) === 'reducing',
      )
      .reduce((sum, tx) => sum + toMinorUnits(tx.amount, digits), 0);
    if (itemTotal > toMinorUnits(item.originalAmount, digits) || journalTotal > postingTotal) {
      throw new Error(
        'Cannot restore repayment because its allocation exceeds the item or posting',
      );
    }
  }
}

export async function guardAndSyncJournalDeleteOrReverseInSession(input: {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalIds: readonly JournalId[];
  action: 'delete' | 'reverse';
  deletedAt?: Date;
}): Promise<void> {
  const journalIds = new Set(input.journalIds);
  const allItems = openItemsInSession(
    input.session,
    await personQueryRepository.listOpenItemsForJournals(input.workplaceId, input.journalIds),
    row => row.workplaceId === input.workplaceId && journalIds.has(row.originatingJournalId),
  );
  const [itemAllocations, journalAllocations] = await Promise.all([
    personQueryRepository.listActiveAllocationsForItems(
      input.workplaceId,
      allItems.map(item => item.id),
    ),
    personQueryRepository.listActiveAllocationsForJournals(input.workplaceId, input.journalIds),
  ]);
  const allItemIds = new Set(allItems.map(row => row.id));
  const allocations = activeAllocationsInSession(
    input.session,
    [...itemAllocations, ...journalAllocations],
    row =>
      row.workplaceId === input.workplaceId &&
      (allItemIds.has(row.openItemId) || journalIds.has(row.settlementJournalId)),
  );
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
        accountId: a.accountId,
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
