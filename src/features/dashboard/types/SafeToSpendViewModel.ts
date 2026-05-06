import { AccountSubtype } from '@/src/data/models/Account';
import {
  AccountCommitment,
  AccountSimulationSummary,
  DebtEntry,
  IncomeEntry,
} from '@/src/services/simulation/types';
import React from 'react';

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

  // Formatted Strings (Pre-masked for Privacy Mode if needed)
  displaySafeToSpend: string | React.ReactNode;
  displayShortfall: string | React.ReactNode;
  displayTotalLiquidAssets: string | React.ReactNode;
  displayCommittedTotal: string | React.ReactNode;
  displayCommittedLiabilities: string | React.ReactNode;
  displayTotalFutureInflow: string | React.ReactNode;

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

  // Helpers
  formatValue: (val: number) => string | React.ReactNode;
  labels: any;
  info: any;
}
