import { render } from '@testing-library/react-native';
import {
  PrimaryNavigationProvider,
  useReportDrawerSwipePermission,
  type PrimaryNavigationContextValue,
} from '../primaryNavigation';

function Reporter({ allowed }: { allowed: boolean }) {
  useReportDrawerSwipePermission(allowed);
  return null;
}

function navigation(report: (allowed: boolean) => void): PrimaryNavigationContextValue {
  return {
    reportSelectionMode: jest.fn(),
    selectionModeActive: false,
    drawerVisible: false,
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    userName: 'Test',
    reportDrawerSwipePermission: report,
  };
}

it('publishes blockers and revokes permission when the pager unmounts', () => {
  const report = jest.fn();
  const value = navigation(report);
  const { rerender, unmount } = render(
    <PrimaryNavigationProvider value={value}>
      <Reporter allowed />
    </PrimaryNavigationProvider>,
  );
  expect(report).toHaveBeenLastCalledWith(true);
  rerender(
    <PrimaryNavigationProvider value={value}>
      <Reporter allowed={false} />
    </PrimaryNavigationProvider>,
  );
  expect(report).toHaveBeenLastCalledWith(false);
  rerender(
    <PrimaryNavigationProvider value={value}>
      <Reporter allowed />
    </PrimaryNavigationProvider>,
  );
  expect(report).toHaveBeenLastCalledWith(true);
  unmount();
  expect(report).toHaveBeenLastCalledWith(false);
});

it('revokes permission from the old shell when the reporter changes', () => {
  const previous = jest.fn();
  const next = jest.fn();
  const { rerender } = render(
    <PrimaryNavigationProvider value={navigation(previous)}>
      <Reporter allowed />
    </PrimaryNavigationProvider>,
  );
  rerender(
    <PrimaryNavigationProvider value={navigation(next)}>
      <Reporter allowed />
    </PrimaryNavigationProvider>,
  );
  expect(previous).toHaveBeenLastCalledWith(false);
  expect(next).toHaveBeenLastCalledWith(true);
});
