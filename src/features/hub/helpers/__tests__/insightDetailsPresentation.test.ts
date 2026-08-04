import { AppConfig } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import { buildInsightDetailsHeader } from '../insightDetailsPresentation';

const theme = {
  primary: '#00ff00',
  error: '#ff0000',
  warning: '#ffaa00',
} as Theme;

describe('buildInsightDetailsHeader', () => {
  it('parses amount for MoneyText when present', () => {
    const header = buildInsightDetailsHeader(
      { amount: '42.5', currencyCode: 'USD', severity: 'high', message: 'Spike' },
      theme,
    );
    expect(header.amount).toBe(42.5);
    expect(header.currencyCode).toBe('USD');
    expect(header.severityLabel).toBe(
      AppConfig.strings.dashboard.insightDetails.severityLabel.high,
    );
    expect(header.message).toBe('Spike');
  });

  it('returns null amount when missing', () => {
    const header = buildInsightDetailsHeader({ severity: 'low' }, theme);
    expect(header.amount).toBeNull();
    expect(header.severityLabel).toBe(AppConfig.strings.dashboard.insightDetails.severityLabel.low);
  });
});
