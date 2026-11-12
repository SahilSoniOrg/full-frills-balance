import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { DashboardHeaderActions } from '../DashboardHeaderActions';

describe('DashboardHeaderActions', () => {
  it('announces pending transaction and review insight counts', () => {
    render(
      <DashboardHeaderActions
        onSearchPress={jest.fn()}
        onReviewPress={jest.fn()}
        insightCount={3}
        onSmsPress={jest.fn()}
        unreadSmsCount={2}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'View transaction inbox, 2 items need review' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Review, 3 insights' })).toBeTruthy();
  });

  it('keeps concise labels when there are no unread items', () => {
    const onSmsPress = jest.fn();
    render(
      <DashboardHeaderActions
        onSearchPress={jest.fn()}
        onReviewPress={jest.fn()}
        insightCount={0}
        onSmsPress={onSmsPress}
        unreadSmsCount={0}
      />,
    );

    const inbox = screen.getByRole('button', { name: 'View transaction inbox' });
    expect(inbox).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Review' })).toBeTruthy();
    fireEvent.press(inbox);
    expect(onSmsPress).toHaveBeenCalledTimes(1);
  });
});
