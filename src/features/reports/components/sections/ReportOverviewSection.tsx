import { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { NetWorthTrendWidget } from '@/src/features/reports/components/widgets/NetWorthTrendWidget';
import { IncomeExpenseTrendWidget } from '@/src/features/reports/components/widgets/IncomeExpenseTrendWidget';
import { IncomeExpenseBalanceWidget } from '@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget';
import { MoneyFlowWidget } from '@/src/features/reports/components/widgets/MoneyFlowWidget';

interface ReportOverviewSectionProps {
  vm: ReportOverviewTabVm;
  chartWidth: number;
}

export function ReportOverviewSection({ vm, chartWidth }: ReportOverviewSectionProps) {
  const {
    currentNetWorth,
    netWorthSeries,
    onViewTransactions,
    barChartData,
    displayedIncome,
    displayedExpense,
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
        currentNetWorth={currentNetWorth}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        onViewTransactions={onViewTransactions}
      />

      <IncomeExpenseTrendWidget
        barChartData={barChartData}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        selectedIndex={selectedBarIndex}
        onSelectIndex={onSelectBarIndex}
        onViewSelectedTransactions={onViewSelectedTransactions}
      />

      <IncomeExpenseBalanceWidget
        incomeBarFlex={incomeBarFlex}
        expenseBarFlex={expenseBarFlex}
        income={displayedIncome}
        expense={displayedExpense}
        currencyCode={targetCurrency}
      />

      <MoneyFlowWidget
        sankeyData={sankeyData}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
      />
    </>
  );
}
