import { AppIcon } from '@/src/components/core';
import { Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
    const { theme } = useTheme();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.primary,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarStyle: {
                    backgroundColor: theme.background,
                    borderTopColor: theme.border,
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
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color, size }) => (
                        <AppIcon name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: 'Accounts',
                    tabBarIcon: ({ color, size }) => (
                        <AppIcon name="wallet" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="reports"
                options={{
                    title: 'Reports',
                    tabBarIcon: ({ color, size }) => (
                        <AppIcon name="reports" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Settings',
                    tabBarIcon: ({ color, size }) => (
                        <AppIcon name="settings" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
