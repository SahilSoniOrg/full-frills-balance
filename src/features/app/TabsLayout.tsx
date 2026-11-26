import { PrimaryNavigationProvider } from '@/src/navigation/primaryNavigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import {
  NavigationDrawer,
  PrimaryPager,
  type ContextualAddAction,
} from '@/src/features/navigation';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { PRIMARY_PAGES } from '@/src/navigation/primaryPages';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function TabsLayout() {
  const workplace = useWorkplace();
  const { userName } = useProfilePrefs();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [activeRouteName, setActiveRouteName] = useState('index');
  const [drawerSwipePermission, setDrawerSwipePermission] = useState(false);
  const displayName = userName || 'User';

  const closeDrawer = useCallback(() => setDrawerVisible(false), []);
  const reportSelectionMode = useCallback((active: boolean) => {
    if (active) setDrawerVisible(false);
    setSelectionModeActive(active);
  }, []);
  const openDrawer = useCallback(() => {
    if (selectionModeActive || workplace.isSwitchingWorkplace) return;
    setDrawerVisible(true);
  }, [selectionModeActive, workplace.isSwitchingWorkplace]);
  const reportActiveRoute = useCallback((routeName: string) => {
    setActiveRouteName(routeName);
  }, []);
  const onAddAction = useCallback(
    (action: ContextualAddAction) => {
      const workplaceId = workplace.workplaceId;
      switch (action) {
        case 'expense':
        case 'income':
        case 'transfer':
          AppNavigation.toSimpleJournalEntry(action, { workplaceId, guidedAutopilot: true });
          break;
        case 'account':
          AppNavigation.toAccountCreation(undefined, workplaceId);
          break;
        case 'person':
          AppNavigation.toPeople({ create: '1' });
          break;
        case 'category':
          AppNavigation.toCategoryCreation(undefined, workplaceId);
          break;
        case 'budget':
          AppNavigation.toBudgetForm(undefined, undefined, workplaceId);
          break;
        case 'planned-payment':
          AppNavigation.toPlannedPaymentForm(undefined, undefined, workplaceId);
          break;
      }
    },
    [workplace.workplaceId],
  );

  const navigationContextValue = useMemo(
    () => ({
      reportSelectionMode,
      selectionModeActive,
      drawerVisible,
      openDrawer,
      closeDrawer,
      userName: displayName,
      activeRouteName,
      reportActiveRoute,
      drawerSwipePermission,
      reportDrawerSwipePermission: setDrawerSwipePermission,
    }),
    [
      reportSelectionMode,
      selectionModeActive,
      drawerVisible,
      openDrawer,
      closeDrawer,
      displayName,
      activeRouteName,
      reportActiveRoute,
      drawerSwipePermission,
    ],
  );

  return (
    <PrimaryNavigationProvider value={navigationContextValue}>
      <NavigationDrawer>
        <View style={styles.shell}>
          <PrimaryPager onAddAction={onAddAction} backBehavior="none">
            {PRIMARY_PAGES.map(page => (
              <PrimaryPager.Screen
                key={page.routeName}
                name={page.routeName}
                options={{ title: page.title }}
              />
            ))}
          </PrimaryPager>
        </View>
      </NavigationDrawer>
    </PrimaryNavigationProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
