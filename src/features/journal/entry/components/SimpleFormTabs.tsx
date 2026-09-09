import { AppConfig, Spacing } from '@/src/constants';
import { Icon, AppSegmentedControl } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domainJournal';
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
          { id: 'expense', label: AppConfig.strings.journal.expense, icon: Icon.ArrowDown },
          { id: 'income', label: AppConfig.strings.journal.income, icon: Icon.ArrowUp },
          { id: 'transfer', label: AppConfig.strings.journal.transfer, icon: Icon.SwapHorizontal },
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
