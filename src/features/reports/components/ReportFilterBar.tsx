import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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

    const accountLabel = accountIds.length === 0
        ? 'All Accounts'
        : accountIds.length === 1
            ? '1 Account'
            : `${accountIds.length} Accounts`;

    return (
        <View style={styles.container}>
            <View style={styles.filterRow}>
                <TouchableOpacity
                    style={[styles.filterButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    onPress={onOpenDatePicker}
                >
                    <AppIcon name="calendar" size={Size.iconSm} color={theme.textSecondary} />
                    <AppText variant="caption" style={{ marginLeft: Spacing.xs }}>
                        {dateLabel}
                    </AppText>
                    <AppIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} style={{ marginLeft: Spacing.xs }} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { borderColor: theme.border, backgroundColor: theme.surface, marginLeft: Spacing.sm }]}
                    onPress={onOpenAccountPicker}
                >
                    <AppIcon name="wallet" size={Size.iconSm} color={theme.textSecondary} />
                    <AppText variant="caption" style={{ marginLeft: Spacing.xs }}>
                        {accountLabel}
                    </AppText>
                    <AppIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} style={{ marginLeft: Spacing.xs }} />
                </TouchableOpacity>
            </View>

            <DateRangePicker
                visible={showDatePicker}
                onClose={onCloseDatePicker}
                onSelect={onDateSelect}
                currentFilter={periodFilter}
            />

            <AccountPickerModal
                visible={showAccountPicker}
                onClose={onCloseAccountPicker}
                onSelect={onAccountSelect}
                accounts={vm.accounts}
                selectedIds={accountIds}
                title="Filter by Accounts"
                multiple={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
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
    },
});
