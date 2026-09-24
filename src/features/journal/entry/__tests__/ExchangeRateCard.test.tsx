import { AppConfig, Spacing } from '@/src/constants';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';
import { ExchangeRateCard, type ExchangeRateCardProps } from '../components/ExchangeRateCard';
import { RATE_UNAVAILABLE, resolveFxPair, type FxPairInput } from '../fxPair';

const pairInput: FxPairInput = {
  sourceCurrency: 'USD',
  destCurrency: 'EUR',
  baseCurrency: 'USD',
  fetched: { sourceBaseRate: 1, destBaseRate: 0.8, isLoading: false, error: null },
  sourceAmount: 10,
};

const baseProps: ExchangeRateCardProps = {
  pair: resolveFxPair(pairInput),
  destLabel: 'Money to',
  onManualBaseRateChange: jest.fn(),
  onConvertedAmountChange: jest.fn(),
  onResetToApiRate: jest.fn(),
  testIDPrefix: 'exchange-rate',
};

function renderCard(
  overrides: Partial<ExchangeRateCardProps> = {},
  input: Partial<FxPairInput> = {},
) {
  return render(
    <ExchangeRateCard
      {...baseProps}
      pair={resolveFxPair({ ...pairInput, ...input })}
      {...overrides}
    />,
  );
}

describe('ExchangeRateCard', () => {
  it('renders the market rate for a resolved pair', () => {
    renderCard();

    expect(screen.getByText('1 USD = 1.2500 EUR')).toBeTruthy();
  });

  it('shows the unavailable message instead of a rate when the pair has none', () => {
    renderCard(
      {},
      {
        fetched: {
          sourceBaseRate: null,
          destBaseRate: null,
          isLoading: false,
          error: RATE_UNAVAILABLE,
        },
      },
    );

    expect(screen.queryByText(/1 USD =/)).toBeNull();
    expect(screen.getByText(/Rate unavailable\./)).toBeTruthy();
  });

  it('renders nothing for a same-currency pair without manual input', () => {
    renderCard({}, { destCurrency: 'USD' });

    expect(screen.queryByTestId('exchange-rate-card')).toBeNull();
  });

  it('expands the converted input to fit a long edited amount', () => {
    const onConvertedAmountChange = jest.fn();
    renderCard({ onConvertedAmountChange });

    const input = screen.getByTestId('exchange-rate-converted-amount-input');
    const measure = screen.getByTestId('exchange-rate-converted-amount-measure');
    const longAmount = '123456789012345.67';

    fireEvent.changeText(input, longAmount);
    fireEvent(measure, 'layout', {
      nativeEvent: { layout: { width: 156, height: 20, x: 0, y: 0 } },
    });

    expect(onConvertedAmountChange).toHaveBeenCalledWith(longAmount);
    expect(screen.getByTestId('exchange-rate-converted-amount-input').props.value).toBe(longAmount);
    expect(
      StyleSheet.flatten(screen.getByTestId('exchange-rate-converted-amount-input').props.style)
        .width,
    ).toBe(156 + Spacing.xs);
  });

  it('exposes an accessible reset control and resets the local converted draft', () => {
    const onResetToApiRate = jest.fn();
    renderCard({ onResetToApiRate });

    const input = screen.getByTestId('exchange-rate-converted-amount-input');
    fireEvent.changeText(input, '99.99');

    const resetButton = screen.getByTestId('exchange-rate-reset-fx-rate-button');
    expect(resetButton.props.accessibilityRole).toBe('button');
    expect(resetButton.props.accessibilityLabel).toBe(
      AppConfig.strings.transactionFlow.resetToMarketRate,
    );

    fireEvent.press(resetButton);

    expect(onResetToApiRate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('exchange-rate-converted-amount-input').props.value).toBe('12.50');
  });

  it('shows manual base-rate fields only when the pair needs them', () => {
    const onManualBaseRateChange = jest.fn();
    renderCard(
      { onManualBaseRateChange },
      {
        sourceCurrency: 'EUR',
        destCurrency: 'GBP',
        fetched: {
          sourceBaseRate: null,
          destBaseRate: null,
          isLoading: false,
          error: RATE_UNAVAILABLE,
        },
      },
    );

    fireEvent.changeText(screen.getAllByPlaceholderText('Rate')[1], '1.25');
    expect(onManualBaseRateChange).toHaveBeenCalledWith('destination', '1.25');
  });

  describe('attached variant', () => {
    const attachedInput: Partial<FxPairInput> = {
      sourceCurrency: 'INR',
      destCurrency: 'USD',
      baseCurrency: 'USD',
      fetched: { sourceBaseRate: 0.0104, destBaseRate: 1, isLoading: false, error: null },
      sourceAmount: 1,
    };

    it('renders the converted currency symbol once', () => {
      renderCard({ variant: 'attached', testIDPrefix: 'split-fx' }, attachedInput);

      expect(screen.getAllByText('$')).toHaveLength(1);
      expect(screen.getByTestId('split-fx-card')).toBeTruthy();
    });

    it('keeps the rate direction aligned with the editable conversion', () => {
      renderCard({ variant: 'attached', testIDPrefix: 'split-fx' }, attachedInput);

      expect(screen.getByText('1 INR = 0.0104 USD')).toBeTruthy();
      expect(screen.queryByText('1 USD = 96.1538 INR')).toBeNull();
    });

    it('keeps the converted amount editable', () => {
      const onConvertedAmountChange = jest.fn();
      renderCard(
        { variant: 'attached', testIDPrefix: 'split-fx', onConvertedAmountChange },
        attachedInput,
      );

      fireEvent.changeText(screen.getByTestId('split-fx-converted-amount-input'), '0.02');

      expect(onConvertedAmountChange).toHaveBeenCalledWith('0.02');
    });

    it('never renders manual base-rate fields', () => {
      renderCard(
        { variant: 'attached', testIDPrefix: 'split-fx' },
        {
          ...attachedInput,
          fetched: {
            sourceBaseRate: null,
            destBaseRate: null,
            isLoading: false,
            error: RATE_UNAVAILABLE,
          },
        },
      );

      expect(screen.getByText(RATE_UNAVAILABLE)).toBeTruthy();
      expect(screen.queryByPlaceholderText('Rate')).toBeNull();
    });
  });
});
