import { Animation, AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import Journal from '@/src/data/models/Journal';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { DailyDelta } from '@/src/data/repositories/TransactionTypes';
import { balanceService } from '@/src/services/balance';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { BudgetUsage } from '@/src/services/budget/types';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import { isLiquidAssetSubtype } from '@/src/utils/accountSubtypeUtils';
import { preferences } from '@/src/utils/preferences';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
import dayjs from 'dayjs';
import { combineLatest, from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

/**
 * Fully resolved inputs for Safe-to-Spend projection (simulation + history assembly).
 * Internal to the simulation read-model family — not part of the public workplace handle.
 */
export type SafeToSpendInputSnapshot = {
  workplaceId: WorkplaceId;
  defaultCurrencyCode: string;
  safeToSpendDays: number;
  allAccounts: Account[];
  liquidAssets: Account[];
  liquidLiabilities: Account[];
  liquidAssetIds: AccountId[];
  budgets: Budget[];
  plannedPayments: PlannedPayment[];
  plannedJournals: Journal[];
  usages: BudgetUsage[];
  rawDeltas: DailyDelta[];
  startingBalances: Map<AccountId, number>;
  totalLiquidAssetsAmount: number;
  liabilityAccountBalances: { account: Account; balance: number }[];
  startOfToday: dayjs.Dayjs;
  lookbackDate: number;
};

export type SafeToSpendInputOutcome =
  | { kind: 'empty'; defaultCurrencyCode: string }
  | { kind: 'ready'; snapshot: SafeToSpendInputSnapshot };

type LedgerReactiveBundle = {
  assets: Account[];
  liabilities: Account[];
  budgets: Budget[];
  plannedPayments: PlannedPayment[];
  allAccounts: Account[];
  plannedJournals: Journal[];
  safeToSpendDays: number;
  defaultCurrencyCode: string;
  workplaceId: WorkplaceId;
};

function mapLedgerBundle(bundle: LedgerReactiveBundle): LedgerReactiveBundle & {
  liquidAssets: Account[];
  liquidLiabilities: Account[];
  liquidAssetIds: AccountId[];
  parentIds: Set<AccountId>;
} {
  const { assets, liabilities, allAccounts } = bundle;
  const parentIds = new Set<AccountId>(
    allAccounts.map(a => a.parentAccountId).filter((id): id is AccountId => Boolean(id)),
  );
  const liquidAssets = assets.filter(
    a => isLiquidAssetSubtype(a.accountSubtype) && !parentIds.has(a.id),
  );
  const liquidLiabilities = liabilities.filter(
    l => l.accountType === AccountType.LIABILITY && !parentIds.has(l.id),
  );
  const liquidAssetIds = liquidAssets.map(a => a.id);
  return {
    ...bundle,
    liquidAssets,
    liquidLiabilities,
    liquidAssetIds,
    parentIds,
  };
}

/**
 * Observes reactive ledger sources, debounces, and assembles the typed input snapshot
 * (FX warm, balances, budget usage, history deltas).
 */
export function observeSafeToSpendInputSnapshot(
  workplaceId: WorkplaceId,
  defaultCurrencyCode: string,
): Observable<SafeToSpendInputOutcome> {
  return combineLatest([preferences.sts.observeSafeToSpendDays()]).pipe(
    switchMap(([safeToSpendDays]) => {
      return combineLatest([
        observeWorkplaceAccounts(workplaceId),
        budgetRepository.observeAllActive(workplaceId),
        plannedPaymentRepository.observeActive(workplaceId),
        journalObserveQueries.observePlannedInRange(
          workplaceId,
          dayjs().subtract(safeToSpendDays, 'day').startOf('day').valueOf(),
          dayjs().add(safeToSpendDays, 'day').endOf('day').valueOf(),
        ),
        observeWorkplaceActiveTransactionCount(workplaceId),
        observeWorkplaceJournalMeta(workplaceId),
      ] as [
        Observable<Account[]>,
        Observable<Budget[]>,
        Observable<PlannedPayment[]>,
        Observable<Journal[]>,
        Observable<number>,
        Observable<unknown>,
      ]).pipe(
        map(([allAccounts, budgets, plannedPayments, plannedJournals]) => {
          const assets = allAccounts.filter(a => a.accountType === AccountType.ASSET);
          const liabilities = allAccounts.filter(a => a.accountType === AccountType.LIABILITY);
          return {
            assets,
            liabilities,
            budgets,
            plannedPayments,
            allAccounts,
            plannedJournals,
            safeToSpendDays,
            defaultCurrencyCode,
            workplaceId,
          };
        }),
      );
    }),
    firstFastDebounce(Animation.observeDebounce),
    switchMap(bundle => {
      const mapped = mapLedgerBundle(bundle);
      const now = dayjs();
      const startOfToday = now.startOf('day');
      const lookbackDate = startOfToday.subtract(mapped.safeToSpendDays, 'day').valueOf();

      if (mapped.liquidAssets.length === 0) {
        return of({ kind: 'empty' as const, defaultCurrencyCode: mapped.defaultCurrencyCode });
      }

      const history$ = from(
        transactionRawRepository.getDailyDeltasGroupedRaw(
          workplaceId,
          mapped.liquidAssetIds,
          lookbackDate,
          startOfToday.valueOf() + AppConfig.time.msPerDay,
        ),
      );

      const budgetUsageObservables = mapped.budgets.map(b =>
        budgetReadService.observeBudgetUsage(workplaceId, b.id),
      );
      const budgetUsage$ =
        budgetUsageObservables.length > 0
          ? combineLatest(budgetUsageObservables)
          : of([] as BudgetUsage[]);

      return combineLatest([budgetUsage$, history$]).pipe(
        switchMap(async ([usages, rawDeltas]) => {
          const uniqueBaseCurrencies = new Set<string>();
          uniqueBaseCurrencies.add(mapped.defaultCurrencyCode);

          for (const a of mapped.liquidAssets) {
            if (a.currencyCode && a.currencyCode !== mapped.defaultCurrencyCode) {
              uniqueBaseCurrencies.add(a.currencyCode);
            }
          }
          for (const l of mapped.liquidLiabilities) {
            if (l.currencyCode && l.currencyCode !== mapped.defaultCurrencyCode) {
              uniqueBaseCurrencies.add(l.currencyCode);
            }
          }
          for (const b of mapped.budgets) {
            if (b.currencyCode && b.currencyCode !== mapped.defaultCurrencyCode) {
              uniqueBaseCurrencies.add(b.currencyCode);
            }
          }

          await Promise.all(
            Array.from(uniqueBaseCurrencies).map(base =>
              exchangeRateService.fetchRatesForBase(base).catch(() => ({})),
            ),
          );

          const allBalances = await balanceService.getAccountBalances(
            workplaceId,
            now.valueOf(),
            mapped.defaultCurrencyCode,
          );
          const balancesMapByAccountId = new Map(allBalances.map(b => [b.accountId, b.balance]));

          const startingBalances = new Map<AccountId, number>();
          let totalLiquidAssetsAmount = 0;

          for (const a of mapped.liquidAssets) {
            const balance = balancesMapByAccountId.get(a.id) || 0;
            totalLiquidAssetsAmount += balance;
            startingBalances.set(a.id, balance);
          }

          const liabilityAccountBalances = mapped.liquidLiabilities.map(l => {
            const balance = Math.abs(balancesMapByAccountId.get(l.id) || 0);
            return { account: l, balance };
          });

          const snapshot: SafeToSpendInputSnapshot = {
            workplaceId: mapped.workplaceId,
            defaultCurrencyCode: mapped.defaultCurrencyCode,
            safeToSpendDays: mapped.safeToSpendDays,
            allAccounts: mapped.allAccounts,
            liquidAssets: mapped.liquidAssets,
            liquidLiabilities: mapped.liquidLiabilities,
            liquidAssetIds: mapped.liquidAssetIds,
            budgets: mapped.budgets,
            plannedPayments: mapped.plannedPayments,
            plannedJournals: mapped.plannedJournals,
            usages,
            rawDeltas: rawDeltas || [],
            startingBalances,
            totalLiquidAssetsAmount,
            liabilityAccountBalances,
            startOfToday,
            lookbackDate,
          };

          return { kind: 'ready' as const, snapshot };
        }),
      );
    }),
  );
}
