import { AppConfig } from '@/src/constants';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

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
    if (!result.report) {
      throw new Error('SafeToSpendMapper: Simulation report is missing. UI cannot be rendered.');
    }

    const { summary, report, totalLiquidAssets, accountSummaries, liquidAssetSubtypes } = result;
    const { isPrivacyMode, isLoading, currencyCode } = options;

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

      report,
      isOverCommitted,
      isPositiveSafeToSpend,
      isPrivacyMode,
      isLoading,
      formatValue,
      labels: AppConfig.strings.dashboard.safeToSpendUi,
      info: AppConfig.strings.dashboard.safeToSpendExplanation,
    };
  }
}
