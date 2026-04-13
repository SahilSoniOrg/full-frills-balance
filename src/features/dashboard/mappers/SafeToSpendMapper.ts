import { AppConfig } from '@/src/constants';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import Account from '@/src/data/models/Account';
import { selectIncomeEntries } from '@/src/services/simulation/selectors/income';
import { selectCommittedEntries } from '@/src/services/simulation/selectors/committed';
import { selectDebtEntries } from '@/src/services/simulation/selectors/debt';

export interface MapperOptions {
  isPrivacyMode: boolean;
  isLoading: boolean;
  currencyCode: string;
}

export interface SafeToSpendMapperInput {
  summary: SafeToSpendResult['summary'];
  report: SafeToSpendResult['report'];
  totalLiquidAssets: number;
  accountSummaries: SafeToSpendResult['accountSummaries'];
  liquidAssetSubtypes: SafeToSpendResult['liquidAssetSubtypes'];
  accountMap: Map<string, Account>;
}

export class SafeToSpendMapper {
  /**
   * Maps a raw SafeToSpendResult into a UI-ready ViewModel.
   * This is a pure function that handles formatting and derived logic.
   */
  static mapToViewModel(
    result: SafeToSpendMapperInput,
    options: MapperOptions,
  ): SafeToSpendViewModel {
    const { isPrivacyMode, isLoading, currencyCode } = options;

    if (!result.report) {
      // Fallback for missing report (prevents component crash)
      return {
        safeToSpend: 0,
        shortfall: 0,
        totalLiquidAssets: result.totalLiquidAssets || 0,
        committedTotal: 0,
        committedLiabilities: 0,
        effectiveTotal: result.totalLiquidAssets || 0,
        totalFutureInflow: 0,
        totalLiabilities: 0,
        displaySafeToSpend: '---',
        displayShortfall: '---',
        displayTotalLiquidAssets: '---',
        displayCommittedTotal: '---',
        displayCommittedLiabilities: '---',
        displayTotalFutureInflow: '---',
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
        formatValue: (_v: number): string => '---',
        labels: AppConfig.strings.dashboard.safeToSpendUi,
        info: AppConfig.strings.dashboard.safeToSpendExplanation,
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

    const formatValue = (val: number) => {
      if (isLoading) return '---';
      if (isPrivacyMode) return AppConfig.privacyMask;

      const isVerySmall = Math.abs(val) > 0 && Math.abs(val) < 0.5;
      if (isVerySmall) {
        const oneFormatted = CurrencyFormatter.format(1, currencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
        return val > 0 ? `< ${oneFormatted}` : `> -${oneFormatted}`;
      }

      return CurrencyFormatter.format(val, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    };

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

      displaySafeToSpend: formatValue(safeToSpend),
      displayShortfall: formatValue(shortfall),
      displayTotalLiquidAssets: formatValue(totalLiquidAssets || 0),
      displayCommittedTotal: formatValue(committedTotal),
      displayCommittedLiabilities: formatValue(committedLiabilities),
      displayTotalFutureInflow: formatValue(totalFutureInflow),

      insights: {
        firstMajorInflowDay,
        committedLiabilitiesCC: report.liabilities.committedCreditCard || 0,
        committedLiabilitiesOther: report.liabilities.committedOther || 0,
      },

      isOverCommitted,
      isPositiveSafeToSpend,
      isPrivacyMode,
      isLoading,
      formatValue,
      labels: AppConfig.strings.dashboard.safeToSpendUi,
      info: AppConfig.strings.dashboard.safeToSpendExplanation,

      // Derived UI Groupings (Extracted to Selectors)
      income: selectIncomeEntries(report.allFlows).map(e => ({
        ...e,
        amount: isPrivacyMode ? 0 : e.amount,
      })),
      committed: selectCommittedEntries(report.allFlows, accountMap, firstMajorInflowDay).map(
        c => ({
          ...c,
          amount: isPrivacyMode ? 0 : c.amount,
          details: c.details.map(d => ({ ...d, amount: isPrivacyMode ? 0 : d.amount })),
        }),
      ),
      debt: selectDebtEntries(report.allFlows, accountMap).map(e => ({
        ...e,
        amount: isPrivacyMode ? 0 : e.amount,
      })),
    };
  }
}
