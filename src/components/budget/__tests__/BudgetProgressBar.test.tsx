import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { render, screen } from '@/src/utils/test-utils';

describe('BudgetProgressBar', () => {
  it('renders label, percentage, and accessibility for progress', () => {
    render(
      <BudgetProgressBar
        progress={108}
        statusColor="error"
        testID="progress"
        label="Spent"
        showPercentage
        accessibilityLabel="Over, 108% spent"
      />,
    );

    expect(screen.getByTestId('progress')).toBeTruthy();
    expect(screen.getByText('Spent')).toBeTruthy();
    expect(screen.getByText('108%')).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Over, 108% spent' })).toBeTruthy();
    expect(screen.getByTestId('budget-over-segment')).toBeTruthy();
  });
});
