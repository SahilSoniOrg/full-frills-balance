import { render, screen } from '@/src/utils/test-utils';
import { SetupProgressBar } from '@/src/design-system/SetupProgressBar';

describe('SetupProgressBar', () => {
  it('exposes accessible progress values', () => {
    render(<SetupProgressBar label="Step 2 of 6 · Accounts" current={2} total={6} />);

    const progress = screen.getByRole('progressbar');
    expect(progress.props.accessibilityValue).toMatchObject({
      min: 0,
      max: 6,
      now: 2,
    });
  });

  it('clamps invalid counts', () => {
    render(<SetupProgressBar current={0} total={0} valueLabel="0 of 1" />);

    const progress = screen.getByRole('progressbar');
    expect(progress.props.accessibilityValue.max).toBe(1);
  });
});