import {
  classifyPersonDebtPosting,
  isCompatiblePersonAccount,
  isEligiblePostedExpense,
  openItemRemainder,
  projectLinkedAccount,
  summarizePerson,
} from '@/src/domain/people';
import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type PersonAccount from '@/src/data/models/PersonAccount';
import type Transaction from '@/src/data/models/Transaction';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { personObserveQueries, personQueryRepository } from '@/src/data/repositories/people';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { AccountSubtype, AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, PersonId, WorkplaceId } from '@/src/types/ids';
import { Animation } from '@/src/constants/design-tokens';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import { auditTime, combineLatest, from, map, merge, startWith, switchMap } from 'rxjs';
import { currencyReadService } from '@/src/services/currency-read-service';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import {
  acceptsRepaymentDirection,
  availableRepaymentMinorUnits,
  isRepaymentJournal,
} from '@/src/domain/people/personRepaymentPolicy';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import {
  journalObserveQueries,
  type JournalTimelineCursor,
} from '@/src/data/repositories/journal/JournalObserveQueries';
import { debtAccountRole, personAccountRole } from './peopleLedgerReads';

export const asDomainItems = (
  items: Awaited<ReturnType<typeof personQueryRepository.listOpenItems>>,
) =>
  items.map(item => ({
    id: item.id,
    personId: item.personId,
    accountId: item.accountId,
    originatingJournalId: item.originatingJournalId,
    currencyCode: item.currencyCode,
    originalAmount: item.originalAmount,
    direction: item.direction,
    createdAt: item.createdAt?.getTime(),
  }));
export const asDomainAllocations = (
  allocations: Awaited<ReturnType<typeof personQueryRepository.listSettlementAllocations>>,
) =>
  allocations.map(allocation => ({
    id: allocation.id,
    openItemId: allocation.openItemId,
    journalId: allocation.settlementJournalId,
    amount: allocation.amount,
    active: allocation.isActive,
    kind: allocation.allocationKind,
  }));

function groupBy<Row, Key>(rows: readonly Row[], keyFor: (row: Row) => Key): Map<Key, Row[]> {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

type LinkedAccount = { link: PersonAccount; account: Account };
type RepaymentEntry = {
  journalId: JournalId;
  accountId: AccountId;
  currencyCode: string;
  amount: number;
};

async function loadPersonProjection(
  workplaceId: WorkplaceId,
  workplaceCurrency: string,
  personId?: PersonId,
) {
  const [links, items, allocations, precisionByCurrency] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    personQueryRepository.listOpenItems(workplaceId, { personId }),
    personQueryRepository.listSettlementAllocations(workplaceId, { personId, activeOnly: true }),
    currencyReadService.getAllPrecisions(),
  ]);
  const accountIds = [...new Set(links.map(link => link.accountId))];
  const [accounts, balances, origins] = await Promise.all([
    accountIds.length ? accountQueryRepository.findAllByIds(workplaceId, accountIds) : [],
    accountIds.length
      ? balanceReadService.getAccountBalances(
          workplaceId,
          undefined,
          workplaceCurrency,
          undefined,
          accountIds,
        )
      : [],
    personId
      ? journalQueryRepository.findByIds(workplaceId, [
          ...new Set(items.map(item => item.originatingJournalId)),
        ])
      : [],
  ]);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const linked = links.flatMap<LinkedAccount>(link => {
    const account = accountsById.get(link.accountId);
    return account ? [{ link, account }] : [];
  });
  const originDates = new Map(origins.map(journal => [journal.id, journal.journalDate]));
  const domainItems = asDomainItems(items).map(item => ({
    ...item,
    journalDate: originDates.get(item.originatingJournalId),
  }));
  const quotes: Record<string, number> = {};
  await Promise.all(
    [...new Set(accounts.map(account => account.currencyCode))].map(async currency => {
      if (currency === workplaceCurrency) quotes[currency] = 1;
      else {
        const rate = await exchangeRateRepository.getCachedRate(currency, workplaceCurrency);
        if (rate) quotes[currency] = rate.rate;
      }
    }),
  );
  return {
    linksByPerson: groupBy(linked, row => row.link.personId),
    itemsByPerson: groupBy(domainItems, row => row.personId),
    allocationsByItem: groupBy(asDomainAllocations(allocations), row => row.openItemId),
    allocations,
    precisionByCurrency,
    quotes,
    balances: new Map(balances.map(row => [row.accountId, row.directBalance])),
  };
}

function projectPerson(
  personId: PersonId,
  workplaceCurrency: string,
  data: Awaited<ReturnType<typeof loadPersonProjection>>,
) {
  const links = data.linksByPerson.get(personId) ?? [];
  const items = data.itemsByPerson.get(personId) ?? [];
  const precision = (currency: string) =>
    data.precisionByCurrency.get(currency) ?? getCurrencyPrecision(currency);
  const openItems = items.map(item => ({
    item,
    remainder: openItemRemainder(
      item,
      data.allocationsByItem.get(item.id) ?? [],
      precision(item.currencyCode),
    ),
  }));
  const itemsByAccount = groupBy(items, item => item.accountId);
  const linkedAccounts = links.map(({ link, account }) => {
    const accountItems = itemsByAccount.get(account.id) ?? [];
    return {
      ...link,
      account,
      unassignedState: projectLinkedAccount({
        accountId: account.id,
        currencyCode: account.currencyCode,
        ledgerBalanceInNormalDirection: data.balances.get(account.id) ?? 0,
        items: accountItems,
        allocations: accountItems.flatMap(item => data.allocationsByItem.get(item.id) ?? []),
        precision: precision(account.currencyCode),
      }),
    };
  });
  const balanceSummary = summarizePerson({
    personId,
    accounts: links.flatMap(({ account }) => {
      const role = personAccountRole(account.accountType);
      return role
        ? [{ personId, accountId: account.id, role, currencyCode: account.currencyCode }]
        : [];
    }),
    items,
    allocations: [],
    accountLedgerBalances: data.balances,
    convertedCurrency: workplaceCurrency,
    quotes: data.quotes,
    precisionByCurrency: data.precisionByCurrency,
  });
  return { linkedAccounts, openItems, balanceSummary };
}

async function listAvailableRepayments(
  workplaceId: WorkplaceId,
  accounts: readonly Account[],
  allocations: Awaited<ReturnType<typeof personQueryRepository.listSettlementAllocations>>,
  precisionByCurrency: ReadonlyMap<string, number>,
): Promise<RepaymentEntry[]> {
  if (!accounts.length) return [];
  const byAccount = new Map(accounts.map(account => [account.id, account]));
  const transactions = await transactionQueryRepository.findByAccountsAndDateRange(
    workplaceId,
    [...byAccount.keys()],
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const groups = groupBy(transactions, row => row.journalId);
  const allocationsByJournal = groupBy(allocations, row => row.settlementJournalId);
  const journals = await journalQueryRepository.findByIds(workplaceId, [...groups.keys()]);
  return journals
    .filter(isRepaymentJournal)
    .sort((a, b) => b.journalDate - a.journalDate || a.id.localeCompare(b.id))
    .flatMap(journal => {
      const legs = groupBy(groups.get(journal.id) ?? [], row => row.accountId);
      return [...legs].flatMap(([accountId, lines]) => {
        const account = byAccount.get(accountId);
        if (!account) return [];
        const precision =
          precisionByCurrency.get(account.currencyCode) ??
          getCurrencyPrecision(account.currencyCode);
        const reducing = lines.reduce((sum, line) => {
          const direction = classifyPersonDebtPosting({
            accountType: account.accountType,
            transactionType: line.transactionType,
          });
          return direction === 'reducing' ? sum + toMinorUnits(line.amount, precision) : sum;
        }, 0);
        const amount = fromMinorUnits(
          availableRepaymentMinorUnits(
            reducing,
            (allocationsByJournal.get(journal.id) ?? []).filter(row => row.accountId === accountId),
            precision,
          ),
          precision,
        );
        return amount > 0
          ? [{ journalId: journal.id, accountId, currencyCode: account.currencyCode, amount }]
          : [];
      });
    });
}

function pickerGroups(
  people: Awaited<ReturnType<typeof personQueryRepository.listPeople>>,
  links: readonly PersonAccount[],
) {
  const linksByPerson = groupBy(links, link => link.personId);
  return people.map(person => ({
    personId: person.id,
    personName: person.name,
    icon: person.icon,
    color: person.color,
    defaultCurrencyCode: person.defaultCurrencyCode,
    isPinned: Boolean(person.isPinned),
    archived: Boolean(person.archivedAt),
    accountIds: (linksByPerson.get(person.id) ?? []).map(link => link.accountId),
  }));
}

export class PeopleReadService {
  async listPeopleWithBalances(
    workplaceId: WorkplaceId,
    workplaceCurrency: string,
    options: { includeArchived?: boolean } = {},
  ) {
    const [people, data] = await Promise.all([
      personQueryRepository.listPeople(workplaceId, options),
      loadPersonProjection(workplaceId, workplaceCurrency),
    ]);
    return people.map(person => {
      const projection = projectPerson(person.id, workplaceCurrency, data);
      return {
        person,
        ...projection,
        currencies: projection.balanceSummary.currencies,
        convertedNet: projection.balanceSummary.convertedNet,
        hasNegativeUnassignedRemainder: projection.linkedAccounts.some(
          row =>
            debtAccountRole(row.account.accountType) &&
            row.unassignedState.hasNegativeUnassignedRemainder,
        ),
      };
    });
  }

  async getPersonDetail(workplaceId: WorkplaceId, personId: PersonId, workplaceCurrency: string) {
    const person = await personQueryRepository.findPerson(workplaceId, personId);
    if (!person) return null;
    const data = await loadPersonProjection(workplaceId, workplaceCurrency, personId);
    const projection = projectPerson(personId, workplaceCurrency, data);
    const debtAccounts = projection.linkedAccounts
      .map(row => row.account)
      .filter(account => debtAccountRole(account.accountType));
    return {
      person,
      ...projection,
      precisionByCurrency: data.precisionByCurrency,
      activeAllocations: data.allocations,
      unallocatedRepayments: await listAvailableRepayments(
        workplaceId,
        debtAccounts,
        data.allocations,
        data.precisionByCurrency,
      ),
    };
  }

  observePersonPickerGroups(workplaceId: WorkplaceId) {
    return combineLatest([
      personObserveQueries.observePeople(workplaceId, { includeArchived: true }),
      personObserveQueries.observePersonAccounts(workplaceId),
    ]).pipe(
      auditTime(0),
      map(([people, links]) => pickerGroups(people, links)),
    );
  }

  observeOpenItems(workplaceId: WorkplaceId, personId: PersonId, accountId: AccountId) {
    return combineLatest([
      personObserveQueries.observeOpenItems(workplaceId, personId),
      personObserveQueries.observeSettlementAllocations(workplaceId, personId),
    ]).pipe(
      auditTime(0),
      switchMap(([items, allocations]) =>
        from(
          (async () => {
            const scoped = items.filter(item => item.accountId === accountId);
            const [journals, precisionByCurrency] = await Promise.all([
              journalQueryRepository.findByIds(workplaceId, [
                ...new Set(scoped.map(item => item.originatingJournalId)),
              ]),
              currencyReadService.getAllPrecisions(),
            ]);
            const dates = new Map(journals.map(journal => [journal.id, journal.journalDate]));
            const byItem = groupBy(asDomainAllocations(allocations), row => row.openItemId);
            return asDomainItems(scoped)
              .map(item => ({
                item: { ...item, journalDate: dates.get(item.originatingJournalId) },
                remainder: openItemRemainder(
                  item,
                  byItem.get(item.id) ?? [],
                  precisionByCurrency.get(item.currencyCode),
                ),
              }))
              .filter(row => row.remainder > 0);
          })(),
        ),
      ),
    );
  }

  observePeopleTick(workplaceId: WorkplaceId) {
    // Person balances come from live ledger reads, so journal/transaction/account
    // changes must tick the people screens the same way account details do.
    return merge(
      personObserveQueries.observePeople(workplaceId, { includeArchived: true }),
      personObserveQueries.observePersonAccounts(workplaceId),
      personObserveQueries.observeOpenItems(workplaceId),
      personObserveQueries.observeSettlementAllocations(workplaceId),
      personObserveQueries.observeBalanceSnapshots(workplaceId),
      observeWorkplaceJournalMeta(workplaceId),
      observeWorkplaceActiveTransactionCount(workplaceId),
      observeWorkplaceAccounts(workplaceId),
      exchangeRateRepository.observeRevision(),
    ).pipe(
      map(() => null),
      startWith(null),
      firstFastDebounce(Animation.dataRefreshDebounce),
    );
  }

  async listSelectableAccounts(workplaceId: WorkplaceId) {
    const accounts = await accountQueryRepository.findAll(workplaceId);
    const parentIds = new Set(
      accounts.map(account => account.parentAccountId).filter((id): id is AccountId => Boolean(id)),
    );
    return accounts
      .filter(account => !parentIds.has(account.id))
      .map(account => ({
        id: account.id,
        name: account.name,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype ?? AccountSubtype.OTHER,
        currencyCode: account.currencyCode,
        archivedAt: account.archivedAt?.getTime(),
        icon: account.icon,
      }));
  }

  async listLinkableAccountsForPeople(workplaceId: WorkplaceId) {
    const [accounts, links] = await Promise.all([
      this.listSelectableAccounts(workplaceId),
      personQueryRepository.listPersonAccounts(workplaceId),
    ]);
    const linkedAccountIds = new Set(links.map(link => link.accountId));
    return accounts.filter(
      account =>
        !linkedAccountIds.has(account.id) &&
        isCompatiblePersonAccount({
          id: account.id,
          type: account.accountType,
          subtype: account.accountSubtype,
          currencyCode: account.currencyCode,
        }),
    );
  }

  async getPersonProfile(workplaceId: WorkplaceId, personId: PersonId) {
    return personQueryRepository.findPerson(workplaceId, personId);
  }

  async listPersonPickerGroups(workplaceId: WorkplaceId) {
    const [people, links] = await Promise.all([
      personQueryRepository.listPeople(workplaceId, { includeArchived: true }),
      personQueryRepository.listPersonAccounts(workplaceId),
    ]);
    return pickerGroups(people, links);
  }

  async getJournalForSplit(workplaceId: WorkplaceId, journalId: JournalId) {
    const [journal, txs, accounts, links, openItems, people] = await Promise.all([
      journalQueryRepository.find(workplaceId, journalId),
      transactionQueryRepository.findByJournal(workplaceId, journalId),
      accountQueryRepository.findAll(workplaceId),
      personQueryRepository.listPersonAccounts(workplaceId),
      personQueryRepository.listOpenItems(workplaceId, { originatingJournalId: journalId }),
      personQueryRepository.listPeople(workplaceId, { includeArchived: true }),
    ]);
    if (!journal) return null;
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const personById = new Map(people.map(person => [person.id, person]));
    const linkByAccount = new Map(links.map(link => [link.accountId, link.personId]));
    const lines = txs.map(tx => {
      const account = accountById.get(tx.accountId);
      return {
        accountId: tx.accountId,
        accountName: account?.name ?? 'Account',
        accountType: account?.accountType ?? AccountType.EXPENSE,
        amount: tx.amount,
        transactionType: tx.transactionType,
        currencyCode: tx.currencyCode,
        personId: linkByAccount.get(tx.accountId),
      };
    });
    const isAlreadyShared = openItems.length > 0;
    const isEligible = isEligiblePostedExpense(lines, journal.currencyCode, isAlreadyShared);
    const participants = openItems.map(item => ({
      personId: item.personId,
      personName: personById.get(item.personId)?.name ?? 'Person',
      accountId: item.accountId,
      amount: item.originalAmount,
    }));
    const userShare = lines
      .filter(
        line =>
          line.accountType === AccountType.EXPENSE &&
          line.transactionType === TransactionType.DEBIT,
      )
      .reduce((sum, line) => sum + line.amount, 0);
    const totalAmount = lines
      .filter(line => line.transactionType === TransactionType.CREDIT)
      .reduce((sum, line) => sum + line.amount, 0);
    return {
      journal: {
        id: journal.id,
        journalDate: journal.journalDate,
        description: journal.description,
        notes: journal.notes,
        currencyCode: journal.currencyCode,
        status: journal.status,
      },
      lines,
      totalAmount,
      userShare,
      isEligible,
      isAlreadyShared,
      participants,
    };
  }

  async listCompatibleRepaymentJournals(
    workplaceId: WorkplaceId,
    personId: PersonId,
    options: { query?: string; cursor?: JournalTimelineCursor; createdBefore?: number } = {},
  ) {
    const createdBefore = options.createdBefore ?? Date.now();
    const page = await journalObserveQueries.fetchTimelinePage(
      { workplaceId, status: [JournalStatus.POSTED], searchQuery: options.query?.trim() },
      { limit: 40, createdBefore, cursor: options.cursor },
    );
    const ids = page.journals.map(journal => journal.id);
    const [journals, links, accounts, allocations, txs, precision] = await Promise.all([
      journalQueryRepository.findByIds(workplaceId, ids),
      personQueryRepository.listPersonAccounts(workplaceId),
      accountQueryRepository.findAll(workplaceId),
      personQueryRepository.listActiveAllocationsForJournals(workplaceId, ids),
      transactionQueryRepository.findByJournals(workplaceId, ids),
      currencyReadService.getAllPrecisions(),
    ]);
    const journalById = new Map(journals.map(journal => [journal.id, journal]));
    const legsByJournal = groupBy(txs, row => row.journalId);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const personByAccount = new Map(links.map(link => [link.accountId, link.personId]));
    const targets = links.flatMap(link => {
      const account = link.personId === personId ? accountById.get(link.accountId) : undefined;
      return account && debtAccountRole(account.accountType) ? [account] : [];
    });
    const allocated = new Set(allocations.map(row => row.settlementJournalId));
    const matches = ids.flatMap(id => {
      const journal = journalById.get(id);
      if (!journal || allocated.has(id)) return [];
      return repaymentCandidates(
        journal,
        legsByJournal.get(id) ?? [],
        accountById,
        personByAccount,
        targets,
        personId,
        precision,
      );
    });
    return { matches, nextCursor: page.nextCursor, createdBefore };
  }
}

/** Shared by discovery and the serialized write-time matching check. */
export function repaymentCandidates(
  journal: Journal,
  legs: readonly Transaction[],
  accounts: ReadonlyMap<AccountId, Account>,
  people: ReadonlyMap<AccountId, PersonId>,
  targets: readonly Account[],
  personId: PersonId,
  precisionByCurrency: ReadonlyMap<string, number>,
) {
  const effectivePrecisionByCurrency = new Map(precisionByCurrency);
  for (const account of accounts.values()) {
    if (!effectivePrecisionByCurrency.has(account.currencyCode)) {
      effectivePrecisionByCurrency.set(
        account.currencyCode,
        getCurrencyPrecision(account.currencyCode),
      );
    }
  }
  if (!effectivePrecisionByCurrency.has(journal.currencyCode)) {
    effectivePrecisionByCurrency.set(
      journal.currencyCode,
      getCurrencyPrecision(journal.currencyCode),
    );
  }
  if (
    !isRepaymentJournal(journal) ||
    legs.length !== 2 ||
    legs.some(leg => people.has(leg.accountId) && people.get(leg.accountId) !== personId)
  )
    return [];

  const balance = evaluateJournalBalance({
    journalCurrency: journal.currencyCode,
    precisionByCurrency: effectivePrecisionByCurrency,
    lines: legs.map(leg => ({
      id: leg.id,
      accountId: leg.accountId,
      accountCurrency: accounts.get(leg.accountId)?.currencyCode,
      amount: leg.amount,
      exchangeRate: leg.exchangeRate,
      transactionType: leg.transactionType,
    })),
  });
  if (!balance.isBalanced) return [];

  return legs.flatMap(cash => {
    const account = accounts.get(cash.accountId);
    if (!account || people.has(account.id) || !debtAccountRole(account.accountType)) return [];
    const value = balance.lineValues.find(row => row.id === cash.id);
    const counter = legs.find(row => row.id !== cash.id);
    if (!value || !counter) return [];
    const targetAccountIds = targets
      .filter(target => acceptsRepaymentDirection(target.accountType, cash.transactionType))
      .map(target => target.id);
    if (!targetAccountIds.length) return [];
    return [
      {
        id: cash.id,
        journalId: journal.id,
        journalDate: journal.journalDate,
        journalUpdatedAt: journal.updatedAt?.getTime(),
        description: journal.description,
        currencyCode: journal.currencyCode,
        cashAccountId: cash.accountId,
        cashAccountName: account.name,
        cashAmount: value.nativeAmount,
        cashCurrencyCode: value.accountCurrency,
        cashRate: value.exchangeRate,
        journalAmount: value.journalAmount,
        cashTransactionType: cash.transactionType,
        counterAccountId: counter.accountId,
        counterAccountName: accounts.get(counter.accountId)?.name ?? 'Account',
        targetAccountIds,
        expectedCurrent: {
          updatedAt: journal.updatedAt?.toISOString() ?? null,
          status: journal.status,
          currencyCode: journal.currencyCode,
          transactions: legs.map(leg => ({
            accountId: leg.accountId,
            amount: leg.amount,
            transactionType: leg.transactionType,
            notes: leg.notes ?? null,
            exchangeRate: leg.exchangeRate ?? null,
            currencyCode: leg.currencyCode ?? null,
          })),
        },
      },
    ];
  });
}

export const peopleReadService = new PeopleReadService();
