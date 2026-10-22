import { firstValueFrom, of as mockOf, Subject, type Subscription } from 'rxjs';
import Account from '@/src/data/models/Account';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountBalance } from '@/src/types/domainReadModels';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import {
  observeAggregatedAccountBalances,
  type AggregatedAccountBalances,
} from '@/src/services/reactive/reactiveAggregatedBalances';
import { observeWorkplaceAccounts } from '@/src/services/reactive/reactiveWorkplaceObserves';
import { snapshotService } from '@/src/utils/SnapshotService';

jest.mock('@/src/services/balance/balanceReadService', () => ({
  balanceReadService: { getAccountBalances: jest.fn() },
}));
jest.mock('@/src/services/reactive/reactiveAggregatedBalances', () => ({
  observeAggregatedAccountBalances: jest.fn(),
}));
jest.mock('@/src/services/reactive/reactiveWorkplaceObserves', () => ({
  observeWorkplaceAccounts: jest.fn(),
  observeWorkplaceJournalMeta: () => mockOf([]),
  observeWorkplaceActiveTransactionCount: () => mockOf(0),
  clearReactiveWorkplaceAccountsAndJournalMetaCache: jest.fn(),
}));
jest.mock('@/src/data/repositories/ExchangeRateRepository', () => ({
  exchangeRateRepository: { observeAll: () => mockOf([]) },
}));

const workplaceId = 'workplace-details' as WorkplaceId;
const accountId = 'selected-account' as AccountId;
const childId = 'child-account' as AccountId;
const grandchildId = 'grandchild-account' as AccountId;
function account(id: AccountId, parentAccountId?: AccountId): Account {
  return {
    id,
    workplaceId,
    parentAccountId,
    name: id,
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  } as unknown as Account;
}
function balance(id: AccountId): AccountBalance {
  return {
    accountId: id,
    balance: 125,
    directBalance: 125,
    currencyCode: 'USD',
    transactionCount: 42,
    directTransactionCount: 42,
    asOfDate: 0,
    accountType: AccountType.ASSET,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  };
}

describe('account details balance scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reactiveDataService.clearCache();
  });
  afterEach(() => reactiveDataService.clearCache());

  it('stops account-list projection and snapshot work when its tab unsubscribes', () => {
    const aggregates = new Subject<AggregatedAccountBalances>();
    jest.mocked(observeAggregatedAccountBalances).mockReturnValue(aggregates);
    const snapshot = jest
      .spyOn(snapshotService, 'deferCustomSnapshot')
      .mockImplementation(() => {});
    const data: AggregatedAccountBalances = {
      accounts: [],
      balancesMap: new Map(),
      wealthSummary: {
        netWorth: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        totalIncome: 0,
        totalExpense: 0,
      },
    };
    const stream = reactiveDataService.observeOptimizedAccountList('USD', workplaceId);
    const focused = stream.subscribe();
    let refocused: Subscription | undefined;
    try {
      aggregates.next(data);
      expect(snapshot).toHaveBeenCalledTimes(1);

      focused.unsubscribe();
      expect(aggregates.observed).toBe(false);
      aggregates.next(data);
      expect(snapshot).toHaveBeenCalledTimes(1);

      refocused = stream.subscribe();
      aggregates.next(data);
      expect(snapshot).toHaveBeenCalledTimes(2);
    } finally {
      focused.unsubscribe();
      refocused?.unsubscribe();
      snapshot.mockRestore();
    }
    expect(aggregates.observed).toBe(false);
  });

  it('releases a departed detail graph and reads fresh data on re-entry', () => {
    const accounts = new Subject<Account[]>();
    jest.mocked(observeWorkplaceAccounts).mockReturnValue(accounts);
    jest.mocked(balanceReadService.getAccountBalances).mockResolvedValue([balance(accountId)]);

    const first = reactiveDataService
      .observeAccountDashboard(accountId, 'USD', workplaceId)
      .subscribe();
    accounts.next([account(accountId)]);
    expect(balanceReadService.getAccountBalances).toHaveBeenCalledTimes(1);

    first.unsubscribe();
    expect(accounts.observed).toBe(false);
    accounts.next([account(accountId)]);
    expect(balanceReadService.getAccountBalances).toHaveBeenCalledTimes(1);

    const revisit = reactiveDataService
      .observeAccountDashboard(accountId, 'USD', workplaceId)
      .subscribe();
    accounts.next([account(accountId)]);
    expect(balanceReadService.getAccountBalances).toHaveBeenCalledTimes(2);
    revisit.unsubscribe();
    expect(accounts.observed).toBe(false);
  });

  it.each([false, true])(
    'reads only the selected subtree with 1000 unrelated accounts (parent: %s)',
    async isParent => {
      const scopedIds = isParent ? [accountId, childId, grandchildId] : [accountId];
      const accounts = [
        account(accountId),
        ...(isParent ? [account(childId, accountId), account(grandchildId, childId)] : []),
        ...Array.from({ length: 1000 }, (_, i) => account(`unrelated-${i}` as AccountId)),
      ];
      const balances = scopedIds.map(balance);
      jest.mocked(observeWorkplaceAccounts).mockReturnValue(mockOf(accounts));
      jest.mocked(balanceReadService.getAccountBalances).mockResolvedValue(balances);
      jest.mocked(observeAggregatedAccountBalances).mockReturnValue(
        mockOf({
          accounts,
          balancesMap: new Map(balances.map(b => [b.accountId, b])),
          wealthSummary: {
            netWorth: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            totalEquity: 0,
            totalIncome: 0,
            totalExpense: 0,
          },
        }),
      );

      const data = await firstValueFrom(
        reactiveDataService.observeAccountDashboard(accountId, 'USD', workplaceId),
      );
      expect(observeAggregatedAccountBalances).not.toHaveBeenCalled();
      expect(balanceReadService.getAccountBalances).toHaveBeenCalledWith(
        workplaceId,
        undefined,
        'USD',
        undefined,
        expect.arrayContaining(scopedIds),
      );
      expect(jest.mocked(balanceReadService.getAccountBalances).mock.calls[0][4]).toHaveLength(
        scopedIds.length,
      );
      expect(data.balance?.transactionCount).toBe(42);
      expect(data.subAccounts.map(b => b.accountId).sort()).toEqual(scopedIds.slice(1).sort());
      expect(data.allAccounts).toHaveLength(accounts.length);
    },
  );
});
