import { PERSON_AVATAR_SIZE } from '@/src/components/core/PersonAvatar';
import { Icon, type IconName } from '@/src/types/domainIcons';
import {
  PRIMARY_GROUP_DEFAULT_ROUTE,
  primaryPageFromRouteName,
  type PrimaryPageGroup,
} from '@/src/navigation/primaryPages';
import type { GestureType } from 'react-native-gesture-handler';
import { createContext, useContext } from 'react';

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
  pageGesture?: GestureType | null;
  reportPageGesture?: (gesture: GestureType | null) => void;
};

const PrimaryNavigationContext = createContext<PrimaryNavigationContextValue | undefined>(
  undefined,
);

export const PrimaryNavigationProvider = PrimaryNavigationContext.Provider;

export function usePrimaryNavigation() {
  return useContext(PrimaryNavigationContext);
}
