import { AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { BudgetListView } from '@/src/features/budget/components/BudgetListView';
import { PlannedPaymentListView } from '@/src/features/planned-payments/components/PlannedPaymentListView';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Tab = 'budgets' | 'planned';

export default function CommitmentsScreen() {
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<Tab>('budgets');

    const handleAdd = () => {
        if (activeTab === 'budgets') {
            AppNavigation.toBudgetForm();
        } else {
            AppNavigation.toPlannedPaymentForm();
        }
    };

    return (
        <Screen title="Commitments" showBack={false} scrollable={false}>
            <View style={[styles.tabContainer, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                    onPress={() => setActiveTab('budgets')}
                    style={[
                        styles.tab,
                        activeTab === 'budgets' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }
                    ]}
                >
                    <AppText
                        variant="body"
                        weight={activeTab === 'budgets' ? 'bold' : 'medium'}
                        style={{ color: activeTab === 'budgets' ? theme.primary : theme.textSecondary }}
                    >
                        Budgets
                    </AppText>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setActiveTab('planned')}
                    style={[
                        styles.tab,
                        activeTab === 'planned' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }
                    ]}
                >
                    <AppText
                        variant="body"
                        weight={activeTab === 'planned' ? 'bold' : 'medium'}
                        style={{ color: activeTab === 'planned' ? theme.primary : theme.textSecondary }}
                    >
                        Planned
                    </AppText>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {activeTab === 'budgets' ? (
                    <BudgetListView onAddPress={() => AppNavigation.toBudgetForm()} />
                ) : (
                    <PlannedPaymentListView />
                )}
            </View>

            <FloatingActionButton onPress={handleAdd} />
        </Screen>
    );
}

const styles = StyleSheet.create({
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: 1,
    },
    tab: {
        paddingVertical: Spacing.md,
        marginRight: Spacing.xl,
    },
    content: {
        flex: 1,
    },
});
