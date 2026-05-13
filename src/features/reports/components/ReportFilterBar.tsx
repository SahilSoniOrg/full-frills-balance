import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { DateRangeTrigger } from '@/src/components/common/DateRangeTrigger';
import { MultiAccountPickerModal } from '@/src/components/common/MultiAccountPickerModal';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export function ReportFilterBar(vm: ReportsViewModel) {
  const { theme } = useTheme();
  const {
    showDatePicker,
    onOpenDatePicker,
    onCloseDatePicker,
    onDateSelect,
    dateLabel,
    periodFilter,
    showAccountPicker,
    onOpenAccountPicker,
    onCloseAccountPicker,
    accountIds,
    onAccountSelect,
  } = vm;

  const accountLabel =
    accountIds.length === 0
      ? AppConfig.strings.reports.allAccounts
      : AppConfig.strings.reports.accountCount(accountIds.length);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.filterRow}>
          <DateRangeTrigger label={dateLabel} onPress={onOpenDatePicker} />

          <TouchableOpacity
            style={[
              styles.filterButton,
              { borderColor: theme.border, backgroundColor: theme.surface, marginLeft: Spacing.sm },
            ]}
            onPress={onOpenAccountPicker}
          >
            <AppIcon name="wallet" size={Size.iconSm} color={theme.textSecondary} />
            <AppText variant="caption" style={{ marginLeft: Spacing.xs }}>
              {accountLabel}
            </AppText>
            <AppIcon
              name="chevronDown"
              size={Size.iconSm}
              color={theme.textSecondary}
              style={{ marginLeft: Spacing.xs }}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DateRangePicker
        visible={showDatePicker}
        onClose={onCloseDatePicker}
        onSelect={onDateSelect}
        currentFilter={periodFilter}
      />

      <MultiAccountPickerModal
        visible={showAccountPicker}
        onClose={onCloseAccountPicker}
        onSelect={onAccountSelect}
        accounts={vm.accounts}
        selectedIds={accountIds}
        title={AppConfig.strings.reports.filterByAccounts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Shape.radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    height: Size.xl, // Match DateRangeTrigger height
  },
});
