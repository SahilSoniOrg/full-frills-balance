import { render } from '@/src/testing/render';
import { OpenItemAmount } from '../OpenItemAmount';

describe('OpenItemAmount', () => {
  it('shows the remaining and original native currency amounts', () => {
    const { getByText } = render(
      <OpenItemAmount remainder={5} originalAmount={10} currencyCode="USD" isPrivacyMode={false} />,
    );
    expect(getByText('$5.00 remaining')).toBeTruthy();
    expect(getByText('Partial')).toBeTruthy();
    expect(getByText('of $10.00 total')).toBeTruthy();
  });

  it('respects privacy mode for both amounts', () => {
    const { getByText } = render(
      <OpenItemAmount remainder={5} originalAmount={10} currencyCode="USD" isPrivacyMode />,
    );
    expect(getByText('•••• remaining')).toBeTruthy();
    expect(getByText('of •••• total')).toBeTruthy();
  });
});
