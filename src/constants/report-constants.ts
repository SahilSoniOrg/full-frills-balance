import { Theme } from '@/src/constants/design-tokens';

export const REPORT_CHART_COLOR_KEYS = {
  expense: ['error', 'warning', 'errorLight', 'primaryLight', 'expense'] as const satisfies readonly (keyof Theme)[],
  income: ['success', 'primary', 'successLight', 'asset', 'income'] as const satisfies readonly (keyof Theme)[],
} as const;

export const REPORT_CHART_LAYOUT = {
  netWorthChartHeight: 180,
  barChartHeight: 220,
  donutSize: 160,
  donutStrokeWidth: 25,
  donutFullCircleAngleEpsilon: 0.0001,
  donutLegendCollapsedLimit: 5,
  donutLegendRowAmountFontSize: 10,
  donutLegendRowActiveOpacity: 0.7,
  tooltipWidth: 150,
  netWorthTooltipHeight: 85,
  barTooltipHeight: 80,
  tooltipIconSize: 16,
  tooltipHitSlop: 10,
  tooltipDateMarginBottom: 2,
  tooltipDateFontSize: 10,
  tooltipRowPaddingTop: 4,
  tooltipRowMarginBottom: 8,
  tooltipLabelFontSize: 9,
  tooltipLabelMarginBottom: 1,
  tooltipIconButtonTop: 8,
  tooltipIconButtonRight: 8,
  tooltipIconButtonPadding: 4,
  tooltipShadowOffsetX: 0,
  tooltipShadowOffsetY: 2,
  tooltipShadowOpacity: 0.1,
  tooltipShadowRadius: 4,
  tooltipElevation: 3,
  tooltipZIndex: 100,
  lineChartTicks: [0, 0.5, 1] as const,
  lineChartYLabelOffsetX: 8,
  lineChartYLabelOffsetY: 4,
  lineChartYLabelFontSize: 10,
  lineChartGridOpacity: 0.5,
  lineChartMaxLabelOffsetY: 12,
  lineChartMaxLabelFontSize: 10,
  lineChartMaxPointRadius: 4,
  lineChartSeriesStrokeWidth: 3,
  lineChartSelectedSeriesOpacity: 0.5,
  lineChartSelectedPointRadius: 6,
  lineChartSelectedPointStrokeWidth: 2,
  lineChartSelectedIndicatorStrokeWidth: 1,
  lineChartSelectedIndicatorOffsetY: 6,
  lineChartBorderRadius: 16,
  barChartDefaultBarWidth: 12,
  barChartBarCornerRadius: 4,
  barChartUnselectedOpacity: 0.3,
  barChartAxisLabelFontSize: 10,
  barChartAxisTickOffsetY: 8,
  barChartXAxisLabelFontSize: 10,
  barChartEmptyBorderRadius: 16,
  barSpacing: 4,
  yAxisTicks: [0, 0.25, 0.5, 0.75, 1] as const,
  gestureSensitivity: 5,
} as const;

export const REPORT_CHART_STRINGS = {
  chartNoData: 'No data available',
  incomeShort: 'Inc',
  expenseShort: 'Exp',
  maxLabel: 'Max',
} as const;
 
export const REPORT_CHART_EVENTS = {
  globalTouch: 'globalTouch',
} as const;

export const REPORT_CHART_COLORS = {
  tooltipShadow: '#000',
} as const;
