import { PERSON_AVATAR_SIZE } from '@/src/components/core/PersonAvatar';
import { Icon, type IconName } from '@/src/types/domainIcons';
import {
  PRIMARY_GROUP_DEFAULT_ROUTE,
  primaryPageFromRouteName,
  type PrimaryPageGroup,
} from '@/src/navigation/primaryPages';
import { createContext, useContext, useLayoutEffect } from 'react';

export type PrimaryTab = PrimaryPageGroup;

export const PRIMARY_TABS: readonly {
  tab: PrimaryTab;
  routeName: string;
  label: string;
  icon: IconName;
}[] = [
  {
    tab: 'dashboard',
    routeName: PRIMARY_GROUP_DEFAULT_ROUTE.dashboard,
    label: 'Dashboard',
    icon: Icon.Home,
  },
  {
    tab: 'accounts',
    routeName: PRIMARY_GROUP_DEFAULT_ROUTE.accounts,
    label: 'Accounts',
    icon: Icon.Wallet,
  },
  {
    tab: 'commitments',
    routeName: PRIMARY_GROUP_DEFAULT_ROUTE.commitments,
    label: 'Plans',
    icon: Icon.Calendar,
  },
  {
    tab: 'activity',
    routeName: PRIMARY_GROUP_DEFAULT_ROUTE.activity,
    label: 'Activity',
    icon: Icon.Activity,
  },
];

export function primaryTabFromRouteName(name?: string): PrimaryTab | undefined {
  return primaryPageFromRouteName(name)?.group;
}

/** Hit target / chrome slot for the primary nav avatar trigger. */
export const PRIMARY_NAVIGATION_TRIGGER_SIZE = PERSON_AVATAR_SIZE;

export type PrimaryNavigationContextValue = {
  reportSelectionMode: (active: boolean) => void;
  selectionModeActive: boolean;
  drawerVisible: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  userName: string;
  activeRouteName?: string;
  reportActiveRoute?: (routeName: string) => void;
  /** Pager reports whether a closed-drawer opening swipe may claim touches. */
  reportDrawerSwipePermission?: (allowed: boolean) => void;
  drawerSwipePermission?: boolean;
};

const PrimaryNavigationContext = createContext<PrimaryNavigationContextValue | undefined>(
  undefined,
);

export const PrimaryNavigationProvider = PrimaryNavigationContext.Provider;

// The drawer already observes the workplace list. Share its cardinality with
// header chrome instead of starting another list subscription for a label.
const MultipleWorkplacesContext = createContext(false);
export const MultipleWorkplacesProvider = MultipleWorkplacesContext.Provider;
export function useHasMultipleWorkplaces() {
  return useContext(MultipleWorkplacesContext);
}

export function usePrimaryNavigation() {
  return useContext(PrimaryNavigationContext);
}

/** Publish before touches resume, and revoke permission when the pager leaves. */
export function useReportDrawerSwipePermission(allowed: boolean) {
  const reportPermission = usePrimaryNavigation()?.reportDrawerSwipePermission;
  useLayoutEffect(() => {
    reportPermission?.(allowed);
    return () => reportPermission?.(false);
  }, [allowed, reportPermission]);
}
