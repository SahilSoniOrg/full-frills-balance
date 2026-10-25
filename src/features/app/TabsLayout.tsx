import { PrimaryNavigationProvider } from '@/src/navigation/primaryNavigation';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { SafeAreaScope } from '@/src/design-system/SafeArea';
import { useProfilePrefs } from '@/src/hooks/useProfilePrefs';
import {
  NavigationDrawer,
  PrimaryTabBar,
  type ContextualAddAction,
} from '@/src/features/navigation';
import { AppNavigation } from '@/src/utils/navigation';
import { Tabs } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export function TabsLayout() {
  const workplace = useWorkplace();
  const { userName } = useProfilePrefs();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
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
        }}
      >
        <NavigationDrawer>
          <View style={styles.shell}>
            <Tabs
              tabBar={props => (
                <PrimaryTabBar
                  {...props}
                  isSwitching={workplace.isSwitchingWorkplace}
                  onAddAction={onAddAction}
                />
              )}
              screenOptions={{
                headerShown: false,
                // Custom tabBar owns chrome; keep the navigator wrapper from clipping
                // the raised Add shadow at the bar’s top edge.
                tabBarStyle: {
                  backgroundColor: 'transparent',
                  borderTopWidth: 0,
                  elevation: 0,
                  overflow: 'visible',
                },
              }}
              screenListeners={{
                focus: () => setSelectionModeActive(false),
              }}
              screenLayout={({ children }: { children: ReactNode }) => (
                <RemountOnWorkplace>{children}</RemountOnWorkplace>
              )}
            >
              <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
              <Tabs.Screen name="accounts" options={{ title: 'Accounts' }} />
              <Tabs.Screen name="commitments" options={{ title: 'Plans' }} />
              <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
            </Tabs>
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
