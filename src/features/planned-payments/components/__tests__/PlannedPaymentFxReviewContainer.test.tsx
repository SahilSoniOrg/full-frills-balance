import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { PlannedPaymentFxReviewSheet } from '@/src/components/overlays/PlannedPaymentFxReviewContainer';
import type { PlannedPaymentFxReviewRequest } from '@/src/services/planned-payment/plannedPaymentFx';
import { asAccountId, asPlannedPaymentId, asWorkplaceId } from '@/src/types/ids';
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => ({
  __esModule: true,
  default: jest.requireActual('react-native').View,
}));
jest.mock('@/src/components/core/PressScaleTouchable', () => ({
  PressScaleTouchable: ({
    children,
    surfaceStyle,
    ...props
  }: import('@/src/components/core/PressScaleTouchable').PressScaleTouchableProps) => {
    const { Pressable, View } = jest.requireActual('react-native');
    return (
      <Pressable {...props}>
        <View style={surfaceStyle}>{children}</View>
      </Pressable>
    );
  },
}));

jest.mock('@/src/hooks/useAccounts', () => ({ useAccount: () => ({ account: undefined }) }));
jest.mock('@/src/hooks/use-currencies', () => ({ useCurrencyPrecision: () => ({ precision: 2 }) }));
jest.mock('@/src/hooks/useCrossCurrencyRates', () => ({
  useCrossCurrencyRates: () => ({
    sourceBaseRate: 1,
    destBaseRate: 1 / 85,
    isLoading: false,
    error: null,
  }),
}));

const request: PlannedPaymentFxReviewRequest = {
  name: 'Monthly transfer',
  sourceAmount: 100,
  destinationAmount: 100,
  sourceCurrency: 'USD',
  destinationCurrency: 'INR',
  fromAccountId: asAccountId('usd'),
  toAccountId: asAccountId('inr'),
  workplaceId: asWorkplaceId('workplace'),
  plannedPaymentId: asPlannedPaymentId('plan'),
  occurrenceDate: 1791158400000,
  planVersion: 'template-version',
  occurrenceVersion: 'occurrence-version',
};

describe('planned payment manual FX review', () => {
  it('allows editing both native amounts while retaining the reviewed occurrence identity', () => {
    const onFinish = jest.fn();
    render(<PlannedPaymentFxReviewSheet request={request} onFinish={onFinish} />);
    fireEvent.changeText(screen.getByTestId('planned-payment-review-source-amount'), '120');
    fireEvent.changeText(
      screen.getByTestId('planned-payment-review-fx-converted-amount-input'),
      '85',
    );
    fireEvent.press(screen.getByTestId('planned-payment-review-post'));
    expect(onFinish).toHaveBeenCalledWith({ ...request, sourceAmount: 120, destinationAmount: 85 });
  });

  it.each(['', '0', '.'])(
    'blocks posting after clearing or invalidating the destination: %s',
    value => {
      const onFinish = jest.fn();
      render(<PlannedPaymentFxReviewSheet request={request} onFinish={onFinish} />);
      const input = screen.getByTestId('planned-payment-review-fx-converted-amount-input');
      fireEvent.changeText(input, value);
      fireEvent(input, 'blur');
      expect(screen.getByTestId('planned-payment-review-post')).toBeDisabled();
      fireEvent.press(screen.getByTestId('planned-payment-review-post'));
      expect(onFinish).not.toHaveBeenCalled();
    },
  );

  it('can restore a current estimate and cancel without settling the occurrence', () => {
    const onFinish = jest.fn();
    render(<PlannedPaymentFxReviewSheet request={request} onFinish={onFinish} />);
    fireEvent.press(screen.getByTestId('planned-payment-review-fx-reset-fx-rate-button'));
    expect(screen.getByTestId('planned-payment-review-fx-converted-amount-input')).toHaveProp(
      'value',
      '8500.00',
    );
    fireEvent.press(screen.getByTestId('planned-payment-review-close'));
    expect(onFinish).toHaveBeenCalledWith(null);
  });
});
