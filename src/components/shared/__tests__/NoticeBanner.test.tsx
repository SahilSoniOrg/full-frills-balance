import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Icon } from '@/src/types/domainIcons';
import { render, screen } from '@/src/utils/test-utils';

describe('NoticeBanner', () => {
  it('renders the message and tone icon as an alert', () => {
    render(
      <NoticeBanner
        message="Something needs attention."
        tone="error"
        icon={Icon.Error}
        testID="notice-banner"
      />,
    );

    expect(screen.getByTestId('notice-banner')).toBeTruthy();
    expect(screen.getByText('Something needs attention.')).toBeTruthy();
  });
});
