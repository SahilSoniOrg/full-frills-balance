import { Icon, AppIcon } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_BOTTOM_CLEARANCE = Spacing.md;

export function TabsLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarBottomInset = insets.bottom + TAB_BAR_BOTTOM_CLEARANCE;

  return (
    <Tabs
      safeAreaInsets={{ bottom: tabBarBottomInset }}
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          ...Shape.elevation.md,
        },
        tabBarItemStyle: { borderRadius: Shape.radius.md },
        tabBarHideOnKeyboard: true,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarButtonTestID: 'tab-dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name={Icon.Home}
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarButtonTestID: 'tab-accounts',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name={Icon.Wallet}
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="commitments"
        options={{
          title: 'Commitments',
          tabBarButtonTestID: 'tab-commitments',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name={Icon.Handshake}
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name={Icon.Activity}
        options={{
          title: 'Activity',
          tabBarButtonTestID: 'tab-activity',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name={Icon.Activity}
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name={Icon.Settings}
        options={{
          title: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name={Icon.Settings}
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
    </Tabs>
  );
}
