import { AccountSubtype } from '@/src/data/models/Account';
import {
  AccountCommitment,
  AccountSimulationSummary,
  DebtEntry,
  IncomeEntry,
} from '@/src/services/simulation/types';

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
  isPrivacyMode: boolean;
  isLoading: boolean;
  safeToSpendDays: number;

  labels: any;
  info: any;
}
