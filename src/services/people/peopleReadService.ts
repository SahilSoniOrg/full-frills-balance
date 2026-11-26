import { projectLinkedAccount, summarizePerson, openItemRemainder } from '@/src/domain/people';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { personQueryRepository } from '@/src/data/repositories/people';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import type { AccountId, PersonId, WorkplaceId } from '@/src/types/ids';

const asDomainItems = (items: Awaited<ReturnType<typeof personQueryRepository.listOpenItems>>) =>
  items.map(item => ({
    id: item.id,
    personId: item.personId,
    accountId: item.accountId,
    originatingJournalId: item.originatingJournalId,
    currencyCode: item.currencyCode,
    originalAmount: item.originalAmount,
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
    const domainItems = asDomainItems(items);
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
    const unallocatedRepayments = repaymentTransactions.filter(
      tx => !domainAllocations.some(a => a.journalId === tx.journalId),
    );
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
}

export const peopleReadService = new PeopleReadService();
