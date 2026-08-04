import { AppConfig } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import { buildInsightDetailsHeader } from '../insightDetailsPresentation';

const theme = {
  primary: '#00ff00',
  error: '#ff0000',
  warning: '#ffaa00',
} as Theme;

describe('buildInsightDetailsHeader', () => {
  it('masks amount when privacy is on', () => {
    const header = buildInsightDetailsHeader(
      { amount: '42.5', currencyCode: 'USD', severity: 'high', message: 'Spike' },
      theme,
      true,
    );
    expect(header.amountText).toBe(AppConfig.privacyMask);
    expect(header.severityLabel).toBe(
      AppConfig.strings.dashboard.insightDetails.severityLabel.high,
    );
    expect(header.message).toBe('Spike');
  });

  it('formats amount when privacy is off', () => {
    const header = buildInsightDetailsHeader(
      { amount: '10', currencyCode: 'USD', severity: 'low' },
      theme,
      false,
    );
    expect(header.amountText).toContain('10');
    expect(header.severityLabel).toBe(AppConfig.strings.dashboard.insightDetails.severityLabel.low);
  });
});
