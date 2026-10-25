import { PERSON_AVATAR_SIZE } from '@/src/components/core/PersonAvatar';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { createContext, useContext } from 'react';

export type PrimaryTab = 'dashboard' | 'accounts' | 'commitments' | 'activity';

export const PRIMARY_TABS: readonly {
  tab: PrimaryTab;
  routeName: string;
  label: string;
  icon: IconName;
}[] = [
  { tab: 'dashboard', routeName: 'index', label: 'Dashboard', icon: Icon.Home },
  { tab: 'accounts', routeName: 'accounts', label: 'Accounts', icon: Icon.Wallet },
  { tab: 'commitments', routeName: 'commitments', label: 'Plans', icon: Icon.Calendar },
  { tab: 'activity', routeName: 'activity', label: 'Activity', icon: Icon.Activity },
];

export function primaryTabFromRouteName(name?: string): PrimaryTab | undefined {
  return PRIMARY_TABS.find(item => item.routeName === name)?.tab;
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
};

const PrimaryNavigationContext = createContext<PrimaryNavigationContextValue | undefined>(
  undefined,
);

export const PrimaryNavigationProvider = PrimaryNavigationContext.Provider;

export function usePrimaryNavigation() {
  return useContext(PrimaryNavigationContext);
}
