import { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { NetWorthTrendWidget } from '@/src/features/reports/components/widgets/NetWorthTrendWidget';
import { IncomeExpenseTrendWidget } from '@/src/features/reports/components/widgets/IncomeExpenseTrendWidget';
import { IncomeExpenseBalanceWidget } from '@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget';
import { MoneyFlowWidget } from '@/src/features/reports/components/widgets/MoneyFlowWidget';

interface ReportOverviewSectionProps {
  vm: ReportOverviewTabVm;
  chartWidth: number;
  isPrivacyMode: boolean;
}

export function ReportOverviewSection({
  vm,
  chartWidth,
  isPrivacyMode,
}: ReportOverviewSectionProps) {
  const {
    displayedNetWorthText,
    netWorthSeries,
    onViewTransactions,
    barChartData,
    displayedIncomeText,
    displayedExpenseText,
    incomeBarFlex,
    expenseBarFlex,
    sankeyData,
    targetCurrency,
    onViewSelectedTransactions,
    selectedBarIndex,
    onSelectBarIndex,
  } = vm;

  return (
    <>
      <NetWorthTrendWidget
        series={netWorthSeries}
        displayedNetWorthText={displayedNetWorthText}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        isPrivacyMode={isPrivacyMode}
        onViewTransactions={onViewTransactions}
      />

      <IncomeExpenseTrendWidget
        barChartData={barChartData}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        selectedIndex={selectedBarIndex}
        onSelectIndex={onSelectBarIndex}
        isPrivacyMode={isPrivacyMode}
        onViewSelectedTransactions={onViewSelectedTransactions}
      />

      <IncomeExpenseBalanceWidget
        incomeBarFlex={incomeBarFlex}
        expenseBarFlex={expenseBarFlex}
        displayedIncomeText={displayedIncomeText}
        displayedExpenseText={displayedExpenseText}
      />

      <MoneyFlowWidget
        sankeyData={sankeyData}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        isPrivacyMode={isPrivacyMode}
      />
    </>
  );
}
