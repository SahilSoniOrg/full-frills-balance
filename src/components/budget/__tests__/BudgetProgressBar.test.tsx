import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { render, screen } from '@/src/utils/test-utils';

describe('BudgetProgressBar', () => {
  it('supports the generic labelled percentage presentation', () => {
    render(
      <BudgetProgressBar
        progress={45}
        label="Restoring data"
        showPercentage
        statusColor="primary"
        testID="progress"
      />,
    );

    expect(screen.getByTestId('progress')).toBeTruthy();
    expect(screen.getByText('Restoring data')).toBeTruthy();
    expect(screen.getByText('45%')).toBeTruthy();
  });
});
