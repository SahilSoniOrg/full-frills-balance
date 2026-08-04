import { AppConfig } from '@/src/constants';
import { AccountSubtype } from '@/src/data/models/Account';
import {
  AccountCommitment,
  AccountSimulationSummary,
  DebtEntry,
  IncomeEntry,
} from '@/src/services/simulation/types';

export type ResolvedCopy<T> = T extends (...args: never[]) => infer R
  ? R
  : T extends readonly (infer Item)[]
    ? ResolvedCopy<Item>[]
    : T extends object
      ? { [K in keyof T]: ResolvedCopy<T[K]> }
      : T;

export type SafeToSpendLabels = ResolvedCopy<typeof AppConfig.strings.dashboard.safeToSpendUi>;
export type SafeToSpendInfo = ResolvedCopy<
  typeof AppConfig.strings.dashboard.safeToSpendExplanation
>;

export interface SafeToSpendViewModel {
  currencyCode: string;
  // Raw Totals
  safeToSpend: number;
  shortfall: number;
  totalLiquidAssets: number;
  committedTotal: number;
  committedLiabilities: number;
  effectiveTotal: number;
  totalFutureInflow: number;
  totalLiabilities: number;

  // Breakdown Collections (Grouped in Mapper)
  income: IncomeEntry[];
  committed: AccountCommitment[];
  debt: DebtEntry[];

  // Summaries & Metadata
  accountSummaries: AccountSimulationSummary[];
  liquidAssetSubtypes: AccountSubtype[];

  // Insights
  insights: {
    firstMajorInflowDay: number | null;
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
  };

  // Flags
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  isLoading: boolean;
  safeToSpendDays: number;

  labels: SafeToSpendLabels;
  info: SafeToSpendInfo;
}
