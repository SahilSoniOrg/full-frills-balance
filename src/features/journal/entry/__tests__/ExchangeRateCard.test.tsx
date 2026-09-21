import { AppConfig, Spacing } from '@/src/constants';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';
import { ExchangeRateCard, type ExchangeRateCardProps } from '../components/ExchangeRateCard';

const baseProps: ExchangeRateCardProps = {
  amount: '10',
  destLabel: 'Money to',
  sourceCurrency: 'USD',
  destCurrency: 'EUR',
  workplaceCurrency: 'USD',
  isCrossCurrency: true,
  exchangeRate: 1.25,
  isLoadingRate: false,
  rateError: null,
  convertedAmount: 12.5,
  needsWorkplaceRate: false,
  showManualRateFields: false,
  manualSourceBaseRate: '',
  manualDestBaseRate: '',
  setManualBaseRate: jest.fn(),
  setConvertedAmount: jest.fn(),
  resetToApiRate: jest.fn(),
  visible: true,
  testIDPrefix: 'exchange-rate',
};

function renderCard(overrides: Partial<ExchangeRateCardProps> = {}) {
  return render(<ExchangeRateCard {...baseProps} {...overrides} />);
}

describe('ExchangeRateCard', () => {
  it.each([
    ['null', null],
    ['empty string', ''],
    ['invalid string', 'not-a-rate'],
    ['partially numeric string', '12abc'],
    ['zero', 0],
    ['negative number', -1],
  ] as const)('does not render a market rate for %s', (_label, exchangeRate) => {
    renderCard({ exchangeRate });

    expect(screen.queryByText(/1 USD =/)).toBeNull();
  });

  it.each([1.25, '1.25'] as const)(
    'renders a market rate for a positive rate: %s',
    exchangeRate => {
      renderCard({ exchangeRate });

      expect(screen.getByText('1 USD = 1.2500 EUR')).toBeTruthy();
    },
  );

  it('expands the converted input to fit a long edited amount', () => {
    const setConvertedAmount = jest.fn();
    renderCard({ setConvertedAmount });

    const input = screen.getByTestId('exchange-rate-converted-amount-input');
    const measure = screen.getByTestId('exchange-rate-converted-amount-measure');
    const longAmount = '123456789012345.67';

    fireEvent.changeText(input, longAmount);
    fireEvent(measure, 'layout', {
      nativeEvent: { layout: { width: 156, height: 20, x: 0, y: 0 } },
    });

    expect(setConvertedAmount).toHaveBeenCalledWith(longAmount);
    expect(screen.getByTestId('exchange-rate-converted-amount-input').props.value).toBe(longAmount);
    expect(
      StyleSheet.flatten(screen.getByTestId('exchange-rate-converted-amount-input').props.style)
        .width,
    ).toBe(156 + Spacing.xs);
  });

  it('exposes an accessible reset control and resets the local converted draft', () => {
    const resetToApiRate = jest.fn();
    renderCard({ resetToApiRate });

    const input = screen.getByTestId('exchange-rate-converted-amount-input');
    fireEvent.changeText(input, '99.99');

    const resetButton = screen.getByTestId('exchange-rate-reset-fx-rate-button');
    expect(resetButton.props.accessibilityRole).toBe('button');
    expect(resetButton.props.accessibilityLabel).toBe(
      AppConfig.strings.transactionFlow.resetToMarketRate,
    );

    fireEvent.press(resetButton);

    expect(resetToApiRate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('exchange-rate-converted-amount-input').props.value).toBe('12.50');
  });
});
