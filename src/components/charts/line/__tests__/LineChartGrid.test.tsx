import { LineChartGrid, type LineChartGridProps } from '../LineChartGrid';
import { AppConfig } from '@/src/constants/app-config';
import { render, screen } from '@/src/utils/test-utils';
import { Text as SvgText } from 'react-native-svg';

const props: LineChartGridProps = {
  displayMinY: 0,
  displayRange: 100,
  minX: 0,
  maxX: 10,
  height: 160,
  chartWidth: 320,
  plotWidth: 264,
  paddingLeft: 40,
  paddingRight: 16,
  paddingVertical: 16,
  currencyCode: 'INR',
  chartColor: '#4285F4',
  theme: { border: '#333333', textSecondary: '#aaaaaa', surface: '#111111' },
  todayX: 5,
};

describe('LineChartGrid today annotation', () => {
  it.each([100, 75, 25, 0])('separates the day and amount at value %s', value => {
    render(<LineChartGrid {...props} todayDataPoint={{ x: 5, y: value }} />);
    const labels = screen.UNSAFE_getAllByType(SvgText);
    const today = labels.find(label => label.props.children === AppConfig.strings.reports.today);
    const amount = labels.find(label => label.props.fill === props.chartColor);

    expect(today).toBeDefined();
    expect(amount).toBeDefined();
    expect(Math.abs(today!.props.y - amount!.props.y)).toBeGreaterThanOrEqual(20);
    expect(today!.props.y).toBeGreaterThanOrEqual(props.paddingVertical);
    expect(today!.props.y).toBeLessThanOrEqual(props.height - props.paddingVertical);
  });
});
