import { Spacing, Typography } from '@/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_BASE_HEIGHT = 52;
const MIN_BOTTOM_INSET = Spacing.sm;

export default function TabLayout() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    // Dynamic tab bar height: base height + bottom safe area
    const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_INSET);
    const tabBarHeight = TAB_BAR_BASE_HEIGHT + bottomInset;

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.primary,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarStyle: {
                    backgroundColor: theme.background,
                    borderTopColor: theme.border,
                    height: tabBarHeight,
                    paddingBottom: bottomInset,
                },
                headerStyle: {
                    backgroundColor: theme.background,
                    // @ts-ignore
                    boxShadow: 'none',
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                },
                headerTitleStyle: {
                    color: theme.text,
                    fontFamily: Typography.fonts.bold,
                    fontSize: Typography.sizes.xl,
                },
                headerShown: true,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: 'Accounts',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="wallet-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'Reports',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="stats-chart-outline" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Settings',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="settings-outline" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
