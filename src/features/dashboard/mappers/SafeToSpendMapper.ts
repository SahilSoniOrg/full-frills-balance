import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import { selectCommittedEntries } from '@/src/services/simulation/selectors/committed';
import { selectDebtEntries } from '@/src/services/simulation/selectors/debt';
import { selectIncomeEntries } from '@/src/services/simulation/selectors/income';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

export interface MapperOptions {
  isPrivacyMode: boolean;
  isLoading: boolean;
  currencyCode: string;
}

export interface SafeToSpendMapperInput {
  summary: SafeToSpendDashboard['summary'];
  report: SafeToSpendDashboard['report'];
  totalLiquidAssets: number;
  accountSummaries: SafeToSpendDashboard['accountSummaries'];
  liquidAssetSubtypes: SafeToSpendDashboard['liquidAssetSubtypes'];
  accountMap: Map<string, Account>;
  safeToSpendDays: number;
}

export class SafeToSpendMapper {
  /**
   * Maps a raw SafeToSpendDashboard into a UI-ready ViewModel.
   * Raw numeric fields + privacy/loading flags only — leaves format in components.
   */
  static mapToViewModel(
    result: SafeToSpendMapperInput,
    options: MapperOptions,
  ): SafeToSpendViewModel {
    const { isPrivacyMode, isLoading, currencyCode } = options;

    if (!result.report) {
      // Fallback for missing report (prevents component crash)
      return {
        currencyCode: options.currencyCode,
        safeToSpend: 0,
        shortfall: 0,
        totalLiquidAssets: result.totalLiquidAssets || 0,
        committedTotal: 0,
        committedLiabilities: 0,
        effectiveTotal: result.totalLiquidAssets || 0,
        totalFutureInflow: 0,
        totalLiabilities: 0,
        insights: {
          firstMajorInflowDay: null,
          committedLiabilitiesCC: 0,
          committedLiabilitiesOther: 0,
        },
        income: [],
        committed: [],
        debt: [],
        accountSummaries: result.accountSummaries || [],
        liquidAssetSubtypes: result.liquidAssetSubtypes || [],
        isOverCommitted: false,
        isPositiveSafeToSpend: false,
        isPrivacyMode,
        isLoading: true,
        safeToSpendDays: result.safeToSpendDays || 60,
        labels: SafeToSpendMapper.resolveLabels(
          AppConfig.strings.dashboard.safeToSpendUi,
          result.safeToSpendDays || 60,
        ),
        info: SafeToSpendMapper.resolveLabels(
          AppConfig.strings.dashboard.safeToSpendExplanation,
          result.safeToSpendDays || 60,
        ),
      };
    }

    const {
      summary,
      report,
      totalLiquidAssets,
      accountSummaries,
      liquidAssetSubtypes,
      accountMap,
    } = result;

    const safeToSpend = summary?.safeToSpend ?? 0;
    const shortfall = summary?.shortfall ?? 0;
    const isOverCommitted = shortfall > 0;
    const isPositiveSafeToSpend = safeToSpend > 0;

    const committedTotal = report.summary.totalCommittedPlanned ?? 0;
    const committedLiabilities = report.liabilities.committed || 0;
    const totalLiabilities = report.liabilities.total || 0;
    const totalFutureInflow = report.summary.totalFutureInflow ?? 0;
    const firstMajorInflowDay = report.summary.firstMajorInflowDay;

    /**
     * Financial Logic: Effective Total
     *
     * This value is used to determine the total scale of the breakdown bar.
     * It is NOT a financial metric (like Net Worth or Assets), but a UI normalization
     * value that ensures all buckets (Committed, Debts, Safe-to-Spend) have enough
     * relative space to be rendered, even in over-committed or zero-balance scenarios.
     */
    const effectiveTotal = Math.max(
      totalLiquidAssets || 0,
      committedTotal + committedLiabilities + (isOverCommitted ? 0 : safeToSpend),
    );

    return {
      currencyCode,
      safeToSpend,
      shortfall,
      totalLiquidAssets: totalLiquidAssets || 0,
      committedTotal,
      committedLiabilities,
      effectiveTotal,
      totalFutureInflow,
      totalLiabilities,
      accountSummaries: accountSummaries || [],
      liquidAssetSubtypes: liquidAssetSubtypes || [],

      insights: {
        firstMajorInflowDay,
        committedLiabilitiesCC: report.liabilities.committedCreditCard || 0,
        committedLiabilitiesOther: report.liabilities.committedOther || 0,
      },

      isOverCommitted,
      isPositiveSafeToSpend,
      isPrivacyMode,
      isLoading,
      safeToSpendDays: result.safeToSpendDays,
      labels: SafeToSpendMapper.resolveLabels(
        AppConfig.strings.dashboard.safeToSpendUi,
        result.safeToSpendDays,
      ),
      info: SafeToSpendMapper.resolveLabels(
        AppConfig.strings.dashboard.safeToSpendExplanation,
        result.safeToSpendDays,
      ),

      // Derived UI Groupings — raw amounts; display masking via isPrivacyMode + formatAmount
      income: selectIncomeEntries(report.allFlows),
      committed: selectCommittedEntries(report.allFlows, accountMap, firstMajorInflowDay),
      debt: selectDebtEntries(report.allFlows, accountMap),
    };
  }

  private static resolveLabels(obj: any, days: number): any {
    if (typeof obj === 'function') {
      return obj(days);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => SafeToSpendMapper.resolveLabels(item, days));
    }
    if (typeof obj === 'object' && obj !== null) {
      const resolved: any = {};
      for (const key in obj) {
        resolved[key] = SafeToSpendMapper.resolveLabels(obj[key], days);
      }
      return resolved;
    }
    return obj;
  }
}
