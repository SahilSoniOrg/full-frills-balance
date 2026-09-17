import { SafeToSpendBreakdownBar } from '@/src/features/dashboard/components/SafeToSpendBreakdownBar';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('SafeToSpendBreakdownBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('returns null when effectiveTotal is zero', () => {
    render(
      <SafeToSpendBreakdownBar
        effectiveTotal={0}
        committedTotal={0}
        committedLiabilities={0}
        safeToSpend={0}
      />,
    );
    expect(screen.queryByTestId('safe-to-spend-breakdown-bar')).toBeNull();
  });

  it('renders the track when there is composition data', () => {
    render(
      <SafeToSpendBreakdownBar
        effectiveTotal={100}
        committedTotal={40}
        committedLiabilities={20}
        safeToSpend={40}
      />,
    );
    expect(screen.getByTestId('safe-to-spend-breakdown-bar')).toBeTruthy();
  });

  it('renders under reduce motion', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    render(
      <SafeToSpendBreakdownBar
        effectiveTotal={100}
        committedTotal={50}
        committedLiabilities={0}
        safeToSpend={50}
      />,
    );
    expect(screen.getByTestId('safe-to-spend-breakdown-bar')).toBeTruthy();
  });
});
