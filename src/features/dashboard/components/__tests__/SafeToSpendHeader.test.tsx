import { SafeToSpendHeader } from '@/src/features/dashboard/components/SafeToSpendHeader';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

const props = {
  isOverCommitted: false,
  isPositiveSafeToSpend: true,
  amount: 42_000,
  currencyCode: 'INR',
  onInfoPress: jest.fn(),
};

describe('SafeToSpendHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('renders the formatted STS amount', () => {
    render(<SafeToSpendHeader {...props} />);
    expect(screen.getByTestId('safe-to-spend-amount')).toBeTruthy();
  });

  it('still renders the amount when reduce motion is on', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(<SafeToSpendHeader {...props} />);
    expect(screen.getByTestId('safe-to-spend-amount')).toBeTruthy();
  });

  it('renders the amount while loading without Moti settle', () => {
    render(<SafeToSpendHeader {...props} loading />);
    expect(screen.getByTestId('safe-to-spend-amount')).toBeTruthy();
  });
});
