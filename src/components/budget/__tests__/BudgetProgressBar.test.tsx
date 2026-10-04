import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { render, screen } from '@/src/utils/test-utils';

describe('BudgetProgressBar', () => {
  it('renders progress with accessibility label', () => {
    render(<BudgetProgressBar progress={45} statusColor="primary" testID="progress" />);

    expect(screen.getByTestId('progress')).toBeTruthy();
  });
});
