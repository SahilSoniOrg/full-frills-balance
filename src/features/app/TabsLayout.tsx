import { PrimaryNavigationProvider } from '@/src/navigation/primaryNavigation';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SafeAreaScope } from '@/src/design-system/SafeArea';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import {
  NavigationDrawer,
  PrimaryPager,
  type ContextualAddAction,
} from '@/src/features/navigation';
import { AppNavigation } from '@/src/utils/navigation';
import { PRIMARY_PAGES } from '@/src/navigation/primaryPages';
import type { GestureType } from 'react-native-gesture-handler';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function TabsLayout() {
  const workplace = useWorkplace();
  const { userName } = useProfilePrefs();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [activeRouteName, setActiveRouteName] = useState('index');
  const [pageGesture, setPageGesture] = useState<GestureType | null>(null);
  const displayName = userName || 'User';

  const closeDrawer = () => setDrawerVisible(false);
  const reportSelectionMode = (active: boolean) => {
    if (active) closeDrawer();
    setSelectionModeActive(active);
  };
  const openDrawer = () => {
    if (selectionModeActive || workplace.isSwitchingWorkplace) return;
    setDrawerVisible(true);
  };
  const reportActiveRoute = useCallback((routeName: string) => {
    setActiveRouteName(routeName);
    setSelectionModeActive(false);
  }, []);
  const reportPageGesture = useCallback((gesture: GestureType | null) => {
    setPageGesture(previous => (previous === gesture ? previous : gesture));
  }, []);

  const onAddAction = (action: ContextualAddAction) => {
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
  };

  return (
    <SafeAreaScope consumedEdges={['bottom']}>
      <PrimaryNavigationProvider
        value={{
          reportSelectionMode,
          selectionModeActive,
          drawerVisible,
          openDrawer,
          closeDrawer,
          userName: displayName,
          activeRouteName,
          reportActiveRoute,
          pageGesture,
          reportPageGesture,
        }}
      >
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
    </SafeAreaScope>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
