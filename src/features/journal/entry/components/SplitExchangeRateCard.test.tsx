import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { SplitExchangeRateCard, type SplitExchangeRateCardProps } from './SplitExchangeRateCard';

const baseProps: SplitExchangeRateCardProps = {
  baseCurrency: 'INR',
  convertedAmount: '0.0104',
  convertedCurrency: 'USD',
  exchangeRate: 0.0104,
  isLoadingRate: false,
  onConvertedAmountChange: jest.fn(),
  onResetToApiRate: jest.fn(),
  precision: 2,
  visible: true,
  testIDPrefix: 'split-fx',
};

function renderCard(overrides: Partial<SplitExchangeRateCardProps> = {}) {
  return render(<SplitExchangeRateCard {...baseProps} {...overrides} />);
}

describe('SplitExchangeRateCard', () => {
  it('renders the converted currency symbol once', () => {
    renderCard();

    expect(screen.getAllByText('$')).toHaveLength(1);
  });

  it('keeps the rate direction aligned with the editable split conversion', () => {
    renderCard();

    expect(screen.getByText('1 INR = 0.0104 USD')).toBeTruthy();
    expect(screen.queryByText('1 USD = 96.1538 INR')).toBeNull();
  });

  it('keeps the converted amount editable', () => {
    const onConvertedAmountChange = jest.fn();
    renderCard({ onConvertedAmountChange });

    fireEvent.changeText(screen.getByTestId('split-fx-converted-amount-input'), '0.02');

    expect(onConvertedAmountChange).toHaveBeenCalledWith('0.02');
  });
});
