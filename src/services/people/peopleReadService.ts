import {
  classifyPersonDebtPosting,
  isCompatiblePersonAccount,
  isEligiblePostedExpense,
  openItemRemainder,
  projectLinkedAccount,
  summarizePerson,
} from '@/src/domain/people';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { personObserveQueries, personQueryRepository } from '@/src/data/repositories/people';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { AccountSubtype, AccountType, TransactionType } from '@/src/types/enums';
import type { AccountId, JournalId, PersonId, WorkplaceId } from '@/src/types/ids';
import { merge, startWith } from 'rxjs';

const asDomainItems = (items: Awaited<ReturnType<typeof personQueryRepository.listOpenItems>>) =>
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
const asDomainAllocations = (
  allocations: Awaited<ReturnType<typeof personQueryRepository.listSettlementAllocations>>,
) =>
  allocations.map(allocation => ({
    id: allocation.id,
    openItemId: allocation.openItemId,
    journalId: allocation.settlementJournalId,
    amount: allocation.amount,
    active: allocation.isActive,
  }));

export class PeopleReadService {
  async listPeopleWithBalances(
    workplaceId: WorkplaceId,
    workplaceCurrency: string,
    options: { includeArchived?: boolean } = {},
  ) {
    const [people, links, items, allocations, accounts] = await Promise.all([
      personQueryRepository.listPeople(workplaceId, options),
      personQueryRepository.listPersonAccounts(workplaceId),
      personQueryRepository.listOpenItems(workplaceId),
      personQueryRepository.listSettlementAllocations(workplaceId, { activeOnly: true }),
      accountQueryRepository.findAll(workplaceId),
    ]);
    const domainItems = asDomainItems(items);
    const domainAllocations = asDomainAllocations(allocations);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const linked = links
      .map(link => ({ link, account: accountById.get(link.accountId) }))
      .filter(
        (x): x is { link: (typeof links)[number]; account: NonNullable<typeof x.account> } =>
          !!x.account,
      );
    const balances = new Map<AccountId, number>();
    await Promise.all(
      linked.map(async ({ account }) => {
        const balance = await balanceReadService.getAccountBalance(account.id, workplaceId);
        balances.set(account.id, balance.balance);
      }),
    );
    return Promise.all(
      people.map(async person => {
        const personLinks = linked.filter(x => x.link.personId === person.id);
        const personItems = domainItems.filter(item => item.personId === person.id);
        const personAllocations = domainAllocations.filter(allocation =>
          items.some(item => item.id === allocation.openItemId && item.personId === person.id),
        );
        const personAccounts = personLinks.map(
          ({ account }) =>
            ({
              personId: person.id,
              accountId: account.id,
              role:
                account.accountSubtype === 'RECEIVABLE'
                  ? 'receivable'
                  : account.accountSubtype === 'PAYABLE' || account.accountSubtype === 'LOAN'
                    ? 'payable'
                    : account.accountType === 'EXPENSE'
                      ? 'expense'
                      : account.accountType === 'INCOME'
                        ? 'income'
                        : account.accountType === AccountType.LIABILITY
                          ? 'payable'
                          : 'receivable',
              currencyCode: account.currencyCode,
            }) as const,
        );
        const quotes: Record<string, number> = {};
        await Promise.all(
          [...new Set(personAccounts.map(a => a.currencyCode))].map(async currency => {
            if (currency === workplaceCurrency) quotes[currency] = 1;
            else {
              const quote = await exchangeRateRepository.getCachedRate(currency, workplaceCurrency);
              if (quote) quotes[currency] = quote.rate;
            }
          }),
        );
        const summary = summarizePerson({
          personId: person.id,
          accounts: personAccounts,
          items: personItems,
          allocations: personAllocations,
          accountLedgerBalances: balances,
          convertedCurrency: workplaceCurrency,
          quotes,
        });
        const linkedAccounts = personLinks.map(({ link, account }) => ({
          ...link,
          account,
          unassignedState: projectLinkedAccount({
            accountId: account.id,
            currencyCode: account.currencyCode,
            ledgerBalanceInNormalDirection: balances.get(account.id) ?? 0,
            items: personItems,
            allocations: personAllocations,
          }),
        }));
        return {
          person,
          linkedAccounts,
          balanceSummary: summary,
          currencies: summary.currencies,
          convertedNet: summary.convertedNet,
          openItems: personItems.map(item => ({
            item,
            remainder: openItemRemainder(item, personAllocations),
          })),
          hasNegativeUnassignedRemainder: linkedAccounts.some(
            a => a.unassignedState.hasNegativeUnassignedRemainder,
          ),
        };
      }),
    );
  }

  async getPersonDetail(workplaceId: WorkplaceId, personId: PersonId, workplaceCurrency: string) {
    const person = await personQueryRepository.findPerson(workplaceId, personId);
    if (!person) return null;
    const [links, items, allocations, accounts] = await Promise.all([
      personQueryRepository.listPersonAccounts(workplaceId, personId),
      personQueryRepository.listOpenItems(workplaceId, { personId }),
      personQueryRepository.listSettlementAllocations(workplaceId, { personId, activeOnly: true }),
      accountQueryRepository.findAll(workplaceId),
    ]);
    const originJournals = await journalQueryRepository.findByIds(workplaceId, [
      ...new Set(items.map(item => item.originatingJournalId)),
    ]);
    const originDates = new Map(originJournals.map(journal => [journal.id, journal.journalDate]));
    const domainItems = asDomainItems(items)
      .map(item => ({ ...item, journalDate: originDates.get(item.originatingJournalId) }))
      .sort(
        (a, b) =>
          (a.journalDate ?? a.createdAt ?? 0) - (b.journalDate ?? b.createdAt ?? 0) ||
          a.id.localeCompare(b.id),
      );
    const domainAllocations = asDomainAllocations(allocations);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const linkedAccounts = await Promise.all(
      links.map(async link => {
        const account = accountById.get(link.accountId);
        if (!account) return null;
        const balance = await balanceReadService.getAccountBalance(account.id, workplaceId);
        const state = projectLinkedAccount({
          accountId: account.id,
          currencyCode: account.currencyCode,
          ledgerBalanceInNormalDirection: balance.balance,
          items: domainItems,
          allocations: domainAllocations,
        });
        return { ...link, account, unassignedState: state };
      }),
    );
    const validLinks = linkedAccounts.filter((x): x is NonNullable<typeof x> => !!x);
    const personAccounts = validLinks.map(
      ({ account }) =>
        ({
          personId,
          accountId: account.id,
          role:
            account.accountSubtype === 'RECEIVABLE'
              ? 'receivable'
              : account.accountSubtype === 'PAYABLE' || account.accountSubtype === 'LOAN'
                ? 'payable'
                : account.accountType === 'EXPENSE'
                  ? 'expense'
                  : account.accountType === 'INCOME'
                    ? 'income'
                    : account.accountType === AccountType.LIABILITY
                      ? 'payable'
                      : 'receivable',
          currencyCode: account.currencyCode,
        }) as const,
    );
    const ledger = new Map<AccountId, number>();
    await Promise.all(
      validLinks.map(async ({ account }) =>
        ledger.set(
          account.id,
          (await balanceReadService.getAccountBalance(account.id, workplaceId)).balance,
        ),
      ),
    );
    const quotes: Record<string, number> = {};
    await Promise.all(
      [...new Set(personAccounts.map(a => a.currencyCode))].map(async currency => {
        if (currency === workplaceCurrency) quotes[currency] = 1;
        else {
          const rate = await exchangeRateRepository.getCachedRate(currency, workplaceCurrency);
          if (rate) quotes[currency] = rate.rate;
        }
      }),
    );
    const balanceSummary = summarizePerson({
      personId,
      accounts: personAccounts,
      items: domainItems,
      allocations: domainAllocations,
      accountLedgerBalances: ledger,
      convertedCurrency: workplaceCurrency,
      quotes,
    });
    const repaymentTransactions = (
      await Promise.all(
        validLinks
          .filter(x => {
            const role = personAccounts.find(a => a.accountId === x.account.id)?.role;
            return role === 'receivable' || role === 'payable';
          })
          .map(x => transactionQueryRepository.findByAccount(workplaceId, x.account.id)),
      )
    ).flat();
    const accountTypeById = new Map(validLinks.map(x => [x.account.id, x.account.accountType]));
    const unallocatedRepayments = repaymentTransactions.filter(tx => {
      const accountType = accountTypeById.get(tx.accountId);
      if (!accountType) return false;
      if (
        classifyPersonDebtPosting({ accountType, transactionType: tx.transactionType }) !==
        'reducing'
      ) {
        return false;
      }
      return !domainAllocations.some(a => a.journalId === tx.journalId);
    });
    return {
      person,
      linkedAccounts: validLinks,
      openItems: domainItems.map(item => ({
        item,
        remainder: openItemRemainder(item, domainAllocations),
      })),
      activeAllocations: allocations,
      balanceSummary,
      unallocatedRepayments,
    };
  }

  observePeopleTick(workplaceId: WorkplaceId) {
    return merge(
      personObserveQueries.observePeople(workplaceId, { includeArchived: true }),
      personObserveQueries.observePersonAccounts(workplaceId),
      personObserveQueries.observeOpenItems(workplaceId),
      personObserveQueries.observeSettlementAllocations(workplaceId),
      personObserveQueries.observeBalanceSnapshots(workplaceId),
    ).pipe(startWith(null));
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
    return people.map(person => ({
      personId: person.id,
      personName: person.name,
      color: person.color,
      defaultCurrencyCode: person.defaultCurrencyCode,
      isPinned: Boolean(person.isPinned),
      archived: Boolean(person.archivedAt),
      accountIds: links.filter(link => link.personId === person.id).map(link => link.accountId),
    }));
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

  async listCompatibleRepaymentJournals(workplaceId: WorkplaceId, personId: PersonId) {
    const [journals, links, accounts, allocations] = await Promise.all([
      journalQueryRepository.findRecentPosted(workplaceId, 100),
      personQueryRepository.listPersonAccounts(workplaceId),
      accountQueryRepository.findAll(workplaceId),
      personQueryRepository.listSettlementAllocations(workplaceId, { activeOnly: true }),
    ]);
    if (journals.length === 0) return [];
    const txs = await transactionQueryRepository.findByJournals(
      workplaceId,
      journals.map(journal => journal.id),
    );
    const txByJournal = new Map<JournalId, typeof txs>();
    for (const tx of txs) {
      const group = txByJournal.get(tx.journalId) ?? [];
      group.push(tx);
      txByJournal.set(tx.journalId, group);
    }
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const linkedPersonByAccount = new Map(links.map(link => [link.accountId, link.personId]));
    const allocatedJournalIds = new Set(allocations.map(a => a.settlementJournalId));
    return journals
      .filter(journal => !allocatedJournalIds.has(journal.id))
      .flatMap(journal => {
        const journalTxs = txByJournal.get(journal.id) ?? [];
        if (journalTxs.length !== 2) return [];
        const cashLine = journalTxs.find(
          tx =>
            !linkedPersonByAccount.has(tx.accountId) &&
            [AccountType.ASSET, AccountType.LIABILITY].includes(
              accountById.get(tx.accountId)?.accountType ?? AccountType.EXPENSE,
            ),
        );
        if (!cashLine) return [];
        const touchesThisPerson = journalTxs.some(
          tx => linkedPersonByAccount.get(tx.accountId) === personId,
        );
        const touchesOtherPerson = journalTxs.some(tx => {
          const owner = linkedPersonByAccount.get(tx.accountId);
          return owner && owner !== personId;
        });
        if (touchesOtherPerson) return [];
        return [
          {
            journalId: journal.id,
            journalDate: journal.journalDate,
            journalUpdatedAt: journal.updatedAt?.getTime(),
            description: journal.description,
            currencyCode: journal.currencyCode,
            cashAccountId: cashLine.accountId,
            cashAccountName: accountById.get(cashLine.accountId)?.name ?? 'Account',
            cashAmount: cashLine.amount,
            cashTransactionType: cashLine.transactionType,
            touchesPersonAccount: touchesThisPerson,
          },
        ];
      });
  }

  async listPersonJournalHistory(workplaceId: WorkplaceId, personId: PersonId) {
    const [links, accounts] = await Promise.all([
      personQueryRepository.listPersonAccounts(workplaceId, personId),
      accountQueryRepository.findAll(workplaceId),
    ]);
    if (links.length === 0) return [];
    const txs = (
      await Promise.all(
        links.map(link => transactionQueryRepository.findByAccount(workplaceId, link.accountId)),
      )
    ).flat();
    const journalIds = [...new Set(txs.map(tx => tx.journalId))];
    if (journalIds.length === 0) return [];
    const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const journalMap = new Map(journals.map(journal => [journal.id, journal]));
    const byJournal = new Map<
      JournalId,
      {
        journalId: JournalId;
        journalDate: number;
        description?: string;
        currencyCode: string;
        amount: number;
        accountName: string;
        status: string;
      }
    >();
    for (const tx of txs) {
      const journal = journalMap.get(tx.journalId);
      if (!journal || byJournal.has(journal.id)) continue;
      byJournal.set(journal.id, {
        journalId: journal.id,
        journalDate: journal.journalDate,
        description: journal.description,
        currencyCode: journal.currencyCode,
        amount: tx.amount,
        accountName: accountById.get(tx.accountId)?.name ?? 'Account',
        status: journal.status,
      });
    }
    return [...byJournal.values()].sort((a, b) => b.journalDate - a.journalDate);
  }
}

export const peopleReadService = new PeopleReadService();
