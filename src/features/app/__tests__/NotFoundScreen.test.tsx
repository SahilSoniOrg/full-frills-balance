import { fireEvent, render, screen } from '@/src/testing/render';
import { NOT_FOUND_STRINGS } from '@/src/constants/copy/domains/notFoundStrings';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { NotFoundScreen } from '../NotFoundScreen';

jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: { toDashboard: jest.fn() },
}));
jest.mock('@/src/components/layout/ScreenWithChrome', () => ({
  ScreenWithChrome: ({ children }: { children: React.ReactNode }) => children,
}));

describe('NotFoundScreen', () => {
  it('renders a branded not-found message without Expo route links', () => {
    render(<NotFoundScreen />);

    expect(screen.getByText(NOT_FOUND_STRINGS.title)).toBeTruthy();
    expect(screen.getByText(NOT_FOUND_STRINGS.subtitle)).toBeTruthy();
    expect(screen.queryByText(/sitemap/i)).toBeNull();
  });

  it('returns to the dashboard instead of exposing navigation internals', () => {
    render(<NotFoundScreen />);

    fireEvent.press(screen.getByLabelText(NOT_FOUND_STRINGS.action));

    expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
  });
});
