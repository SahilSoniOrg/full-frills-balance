import { AppIcon } from '@/src/components/core';
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
          backgroundColor: theme.surface,
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
              name="home"
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
              name="wallet"
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
              name="handshake"
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarButtonTestID: 'tab-activity',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="activity"
              size={size}
              color={color as string}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color, size, focused }) => (
            <AppIcon
              name="settings"
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
