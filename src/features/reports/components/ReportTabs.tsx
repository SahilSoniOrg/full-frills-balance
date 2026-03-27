import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { ReportTab } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ReportTabsProps {
    activeTab: ReportTab;
    onTabChange: (tab: ReportTab) => void;
}

export function ReportTabs({ activeTab, onTabChange }: ReportTabsProps) {
    const { theme } = useTheme();

    const tabs: { id: ReportTab; label: string }[] = [
        { id: 'OVERVIEW', label: 'Overview' },
        { id: 'SPENDING', label: 'Spending' },
        { id: 'WEALTH', label: 'Wealth' },
    ];

    return (
        <View style={[styles.container, { borderBottomColor: theme.border }]}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <TouchableOpacity
                        key={tab.id}
                        style={[
                            styles.tab,
                            isActive && { borderBottomColor: theme.primary }
                        ]}
                        onPress={() => onTabChange(tab.id)}
                    >
                        <AppText
                            variant="caption"
                            style={[
                                styles.tabText,
                                { color: isActive ? theme.primary : theme.textSecondary },
                                isActive && { fontWeight: '600' }
                            ]}
                        >
                            {tab.label}
                        </AppText>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: 1,
        marginBottom: Spacing.md,
    },
    tab: {
        paddingVertical: Spacing.sm,
        marginRight: Spacing.lg,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: {
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
