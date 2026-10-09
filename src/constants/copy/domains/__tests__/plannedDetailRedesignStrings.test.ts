import { plannedDetailRedesignStrings as copy } from '../plannedDetailRedesignStrings';

describe('planned payment count copy', () => {
  it('uses friendly copy for zero and handles singular/plural', () => {
    expect(copy.paidIn(0)).toBe('No payments recorded yet');
    expect(copy.paidIn(1)).toBe('paid in 1 payment');
    expect(copy.paidIn(3)).toBe('paid in 3 payments');
    expect(copy.endedPayments(0)).toBe('Ended before any payments were recorded');
    expect(copy.endedPayments(1)).toBe('paid in 1 payment');
    expect(copy.endedPayments(2)).toBe('paid in 2 payments');
  });
});
