import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { NavigationDrawer } from '@/src/features/navigation';
import { AppNavigation } from '@/src/utils/navigation';
import { PrimaryNavigationProvider } from '@/src/navigation/primaryNavigation';
import type { ComponentProps } from 'react';
import { BackHandler } from 'react-native';
import type { Drawer } from 'react-native-drawer-layout';
type DrawerProps = ComponentProps<typeof Drawer>;

let mockDrawerProps: DrawerProps | undefined;
const mockSetWorkplaceId = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();
let mockSwitchError: string | null = null;

jest.mock('react-native-drawer-layout', () => {
  const { createElement, Fragment } = jest.requireActual<typeof import('react')>('react');
  return {
    Drawer: (props: DrawerProps) => {
      mockDrawerProps = props;
      return createElement(
        Fragment,
        null,
        props.children,
        props.open ? props.renderDrawerContent() : null,
      );
    },
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      asset: '#1d5fad',
      assetLight: '#e8f2ff',
      border: '#dddddd',
      error: '#bb0000',
      icon: '#666666',
      onPrimary: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.4)',
      primary: '#087f5b',
      primaryLight: '#e3f5ec',
      surface: '#ffffff',
      surfaceSecondary: '#eeeeee',
      text: '#111111',
      textSecondary: '#666666',
      textTertiary: '#888888',
    },
    fonts: {
      bold: 'System',
      heading: 'System',
      medium: 'System',
      numeric: 'System',
      regular: 'System',
      semibold: 'System',
      subheading: 'System',
    },
    getVariantColors: () => ({ main: '#111111' }),
  }),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'home',
    activeWorkplace: { id: 'home', name: 'Personal workplace', icon: 'briefcase' },
    isSwitchingWorkplace: false,
    workplaceSwitchError: mockSwitchError,
    setWorkplaceId: mockSetWorkplaceId,
  }),
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: () => ({
    data: [
      { id: 'home', name: 'Personal workplace', icon: 'briefcase' },
      { id: 'team', name: 'Team workplace', icon: 'briefcase' },
    ],
  }),
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toReports: jest.fn(),
    toHub: jest.fn(),
    toPersonalizationSettings: jest.fn(),
    toAppearanceSettings: jest.fn(),
    toAutomationSettings: jest.fn(),
    toTransactionInbox: jest.fn(),
    toWorkplaceManagement: jest.fn(),
    toSettings: jest.fn(),
    toWorkplaceCreation: jest.fn(),
  },
}));

function renderDrawer({ visible = true, canOpen = true } = {}) {
  const onClose = jest.fn();
  const onOpen = jest.fn();
  render(
    <PrimaryNavigationProvider
      value={{
        reportSelectionMode: jest.fn(),
        selectionModeActive: !canOpen,
        drawerVisible: visible,
        openDrawer: onOpen,
        closeDrawer: onClose,
        userName: 'Test User',
      }}
    >
      <NavigationDrawer>{null}</NavigationDrawer>
    </PrimaryNavigationProvider>,
  );
  return { onClose, onOpen };
}

describe('NavigationDrawer shell', () => {
  beforeEach(() => {
    mockSwitchError = null;
    jest.clearAllMocks();
  });

  it('distinguishes notification settings from insights', () => {
    const { onClose } = renderDrawer();
    fireEvent.press(screen.getByText('Notification settings'));
    expect(AppNavigation.toAutomationSettings).toHaveBeenCalledTimes(1);
    expect(AppNavigation.toHub).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Insights')).toBeTruthy();
  });

  it('honours reduced motion and turns swiping off while the selector is open', () => {
    renderDrawer();

    expect(mockDrawerProps).toMatchObject({ open: true, reduceMotion: true, swipeEnabled: true });

    fireEvent.press(screen.getByLabelText('Active workplace: Personal workplace'));
    expect(mockDrawerProps?.swipeEnabled).toBe(false);
  });

  it('opens from an edge swipe only when the drawer is allowed to open', () => {
    const { onOpen } = renderDrawer({ visible: false });
    expect(mockDrawerProps?.swipeEnabled).toBe(true);
    act(() => mockDrawerProps?.onOpen());
    expect(onOpen).toHaveBeenCalledTimes(1);

    renderDrawer({ visible: false, canOpen: false });
    expect(mockDrawerProps?.swipeEnabled).toBe(false);
  });

  it('closes the selector, then the drawer, on the Android back button', () => {
    const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    });
    const { onClose } = renderDrawer();

    fireEvent.press(screen.getByLabelText('Active workplace: Personal workplace'));
    act(() => {
      expect(handlers.at(-1)?.({} as never)).toBe(true);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio', { name: 'Team workplace' })).toBeNull();

    act(() => {
      expect(handlers.at(-1)?.({} as never)).toBe(true);
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('NavigationDrawer workplace selector', () => {
  beforeEach(() => {
    mockSwitchError = null;
    jest.clearAllMocks();
  });

  it('marks the active workplace in one radio group and separates workplace actions', () => {
    renderDrawer();

    fireEvent.press(screen.getByLabelText('Active workplace: Personal workplace'));

    expect(screen.getAllByText('Personal workplace')).toHaveLength(2);
    expect(
      screen.getByLabelText('Active workplace: Personal workplace').props.accessibilityState,
    ).toMatchObject({ expanded: true });
    expect(screen.getByRole('radiogroup', { name: 'Workplaces' })).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Personal workplace' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(
      screen.getByRole('radio', { name: 'Team workplace' }).props.accessibilityState,
    ).toMatchObject({ checked: false });
    expect(screen.getByText('Create workplace')).toBeTruthy();
    expect(screen.getByText('Import workplace')).toBeTruthy();
  });

  it('switches directly to another workplace and collapses the selector', () => {
    renderDrawer();

    fireEvent.press(screen.getByLabelText('Active workplace: Personal workplace'));
    fireEvent.press(screen.getByRole('radio', { name: 'Team workplace' }));

    expect(mockSetWorkplaceId).toHaveBeenCalledWith('team');
    expect(
      screen.getByLabelText('Active workplace: Personal workplace').props.accessibilityState,
    ).toMatchObject({ expanded: false });
    expect(screen.queryByRole('radiogroup', { name: 'Workplaces' })).toBeNull();
  });

  it('shows switch errors inside the expanded selector', () => {
    mockSwitchError = 'Workplace unavailable';
    renderDrawer();
    fireEvent.press(screen.getByLabelText('Active workplace: Personal workplace'));
    expect(screen.getByText('Workplace unavailable')).toBeTruthy();
  });
});
