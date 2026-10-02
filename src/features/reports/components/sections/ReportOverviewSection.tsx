import { ReportOverviewTabVm } from '@/src/features/reports/hooks/reportTabTypes';
import { NetWorthTrendWidget } from '@/src/features/reports/components/widgets/NetWorthTrendWidget';
import { IncomeExpenseBalanceWidget } from '@/src/features/reports/components/widgets/IncomeExpenseBalanceWidget';
import { MoneyFlowWidget } from '@/src/features/reports/components/widgets/MoneyFlowWidget';
import { ReportSummaryCard } from '@/src/features/reports/components/ReportSummaryCard';
import { Icon } from '@/src/components/core';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import { Column } from '@/src/design-system';

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

      <DetailDisclosure title="Income, expense & money flow" icon={Icon.BarChart} variant="plain">
        <Column gap="xl">
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
        </Column>
      </DetailDisclosure>
    </>
  );
}

