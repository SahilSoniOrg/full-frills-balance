import { SankeyChart } from '@/src/components/charts/SankeyChart';
import { AppConfig } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { SankeyData } from '@/src/services/reports/reportSnapshot';

export interface MoneyFlowWidgetProps {
  sankeyData: SankeyData;
  currencyCode: string;
  chartWidth: number;
  isPrivacyMode: boolean;
}

export function MoneyFlowWidget({
  sankeyData,
  currencyCode,
  chartWidth,
  isPrivacyMode,
}: MoneyFlowWidgetProps) {
  return (
    <ReportChartCard title={AppConfig.strings.reports.moneyFlowTitle} zIndex={20}>
      <SankeyChart
        nodes={sankeyData.nodes}
        links={sankeyData.links}
        currencyCode={currencyCode}
        width={chartWidth}
        hideLabels={isPrivacyMode}
      />
    </ReportChartCard>
  );
}
