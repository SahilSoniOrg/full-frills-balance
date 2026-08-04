import { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { NetWorthTrendWidget } from '@/src/features/reports/components/widgets/NetWorthTrendWidget';
import { IncomeExpenseTrendWidget } from '@/src/features/reports/components/widgets/IncomeExpenseTrendWidget';
import { IncomeExpenseBalanceWidget } from '@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget';
import { MoneyFlowWidget } from '@/src/features/reports/components/widgets/MoneyFlowWidget';

interface ReportOverviewSectionProps {
  vm: ReportOverviewTabVm;
  chartWidth: number;
  formatMoney: (amount: number) => string;
  formatMoneyShort: (amount: number) => string;
}

export function ReportOverviewSection({
  vm,
  chartWidth,
  formatMoney,
  formatMoneyShort,
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
        formatMoney={formatMoney}
        formatMoneyShort={formatMoneyShort}
        onViewTransactions={onViewTransactions}
      />

      <IncomeExpenseTrendWidget
        barChartData={barChartData}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        selectedIndex={selectedBarIndex}
        onSelectIndex={onSelectBarIndex}
        formatMoneyShort={formatMoneyShort}
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
        formatMoneyShort={formatMoneyShort}
      />
    </>
  );
}
