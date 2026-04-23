import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { BudgetListView } from '@/src/features/budget';
import { PlannedPaymentListView } from '@/src/features/planned-payments';
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
      <View style={[styles.topRegion, { borderBottomColor: theme.border }]}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => setActiveTab('budgets')}
            style={[
              styles.tab,
              activeTab === 'budgets' && { borderBottomColor: theme.primary, borderBottomWidth: 2 },
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
              activeTab === 'planned' && { borderBottomColor: theme.primary, borderBottomWidth: 2 },
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
        <ScreenSectionHeader
          subtitle={
            activeTab === 'budgets'
              ? 'Monthly budget limits and usage.'
              : 'Recurring rules and upcoming posts.'
          }
          style={styles.sectionHeader}
        />
      </View>

      <View style={styles.content}>
        {activeTab === 'budgets' ? <BudgetListView /> : <PlannedPaymentListView />}
      </View>
      <FloatingActionButton
        onPress={handleAdd}
        label={activeTab === 'budgets' ? 'New Budget' : 'New Planned Payment'}
        placement="end"
        accessibilityLabel={
          activeTab === 'budgets' ? 'Create a new budget' : 'Create a new planned payment'
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRegion: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    marginTop: Spacing.xs,
  },
  tab: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    marginRight: Spacing.xl,
  },
  content: {
    flex: 1,
  },
});
