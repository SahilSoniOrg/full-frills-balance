import { AppConfig, Spacing } from '@/src/constants';
import { AppSegmentedControl } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domain';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SimpleFormTabsProps {
  type: TabType;
  setType: (type: TabType) => void;
  activeColor: string;
}

export function SimpleFormTabs({ type, setType, activeColor }: SimpleFormTabsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.typeTabs}>
      <AppSegmentedControl
        options={[
          { id: 'expense', label: AppConfig.strings.journal.expense, icon: 'arrowDown' },
          { id: 'income', label: AppConfig.strings.journal.income, icon: 'arrowUp' },
          { id: 'transfer', label: AppConfig.strings.journal.transfer, icon: 'swapHorizontal' },
        ]}
        value={type}
        onChange={next => setType(next as TabType)}
        size="lg"
        flex
        trackColor={theme.surfaceSecondary}
        pillColor={theme.surface}
        activeTextColor={activeColor}
        inactiveTextColor={theme.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  typeTabs: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
