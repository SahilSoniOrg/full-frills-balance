import { Palette } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
    const { theme, themeMode } = useTheme();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: Palette.ivy,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarStyle: {
                    backgroundColor: theme.background,
                    borderTopColor: theme.border,
                    height: 60,
                    paddingBottom: 8,
                },
                headerStyle: {
                    backgroundColor: theme.background,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                },
                headerTitleStyle: {
                    color: theme.text,
                    fontFamily: 'SF Pro Display-Bold',
                    fontSize: 20,
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
        </Tabs>
    );
}
