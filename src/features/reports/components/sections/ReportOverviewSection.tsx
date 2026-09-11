import { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { NetWorthTrendWidget } from '@/src/features/reports/components/widgets/NetWorthTrendWidget';
import { IncomeExpenseBalanceWidget } from '@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget';
import { MoneyFlowWidget } from '@/src/features/reports/components/widgets/MoneyFlowWidget';
import { ReportSummaryCard } from '@/src/features/reports/components/ReportSummaryCard';

interface ReportOverviewSectionProps {
  vm: ReportOverviewTabVm;
  chartWidth: number;
}

export function ReportOverviewSection({ vm, chartWidth }: ReportOverviewSectionProps) {
  const {
    currentNetWorth,
    netWorthSeries,
    onViewTransactions,
    income,
    expense,
    incomeBarFlex,
    expenseBarFlex,
    sankeyData,
    targetCurrency,
    summary,
  } = vm;

  return (
    <>
      <ReportSummaryCard summary={summary} currencyCode={targetCurrency} />

      <NetWorthTrendWidget
        series={netWorthSeries}
        currentNetWorth={currentNetWorth}
        currencyCode={targetCurrency}
        chartWidth={chartWidth}
        onViewTransactions={onViewTransactions}
      />

      <IncomeExpenseBalanceWidget
        incomeBarFlex={incomeBarFlex}
        expenseBarFlex={expenseBarFlex}
        income={income}
        expense={expense}
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
