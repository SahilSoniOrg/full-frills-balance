import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AccountsScreen from '../../app/(tabs)/accounts';
import JournalListScreen from '../../app/(tabs)/index';
import CustomTabBar from './CustomTabBar';

interface TabNavigatorProps {
  initialTab?: 'home' | 'accounts';
}

export default function TabNavigator({ initialTab = 'home' }: TabNavigatorProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'accounts'>(initialTab);
  const { theme } = useTheme();
  const router = useRouter();

  const handleTabChange = (tab: 'home' | 'accounts') => {
    setActiveTab(tab);
  };

  const handleAddIncome = () => {
    // Navigate to journal entry with income pre-selected
    router.push('/journal-entry?mode=simple&type=income');
  };

  const handleAddExpense = () => {
    // Navigate to journal entry with expense pre-selected
    router.push('/journal-entry?mode=simple&type=expense');
  };

  const handleAddTransfer = () => {
    // Navigate to journal entry with transfer pre-selected
    router.push('/journal-entry?mode=simple&type=transfer');
  };

  const handleAddAccount = () => {
    // Navigate to account creation
    router.push('/account-creation');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <JournalListScreen />;
      case 'accounts':
        return <AccountsScreen />;
      default:
        return <JournalListScreen />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {renderContent()}
      </View>
      <CustomTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onAddIncome={handleAddIncome}
        onAddExpense={handleAddExpense}
        onAddTransfer={handleAddTransfer}
        onAddAccount={handleAddAccount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
