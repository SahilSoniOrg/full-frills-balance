import { AppText } from '@/src/components/core';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { ReportTab } from '@/src/features/reports/hooks/reportTabTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ReportTabsProps {
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
}

export function ReportTabs({ activeTab, onTabChange }: ReportTabsProps) {
  const { theme } = useTheme();

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'OVERVIEW', label: AppConfig.strings.reports.tabs.overview },
    { id: 'SPENDING', label: AppConfig.strings.reports.tabs.spending },
    { id: 'WEALTH', label: AppConfig.strings.reports.tabs.wealth },
  ];

  return (
    <View style={[styles.container, { borderBottomColor: theme.border }]}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, isActive && { borderBottomColor: theme.primary }]}
            onPress={() => onTabChange(tab.id)}
          >
            <AppText
              variant="caption"
              weight={isActive ? 'semibold' : 'regular'}
              style={[styles.tabText, { color: isActive ? theme.primary : theme.textSecondary }]}
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
    letterSpacing: Typography.letterSpacing.wide,
  },
});
