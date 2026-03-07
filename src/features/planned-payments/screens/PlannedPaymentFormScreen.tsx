import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { FormScreenScaffold } from '@/src/components/common/FormScreenScaffold';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppCard, AppInput, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';
import { useAccounts } from '@/src/features/accounts';
import { usePlannedPaymentForm } from '@/src/features/planned-payments/hooks/usePlannedPaymentForm';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

export default function PlannedPaymentFormScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const vm = usePlannedPaymentForm(id);
    const { accounts } = useAccounts();
    const { theme } = useTheme();

    const [pickingAccountFor, setPickingAccountFor] = useState<'from' | 'to' | null>(null);

    return (
        <>
            <FormScreenScaffold
                title={id ? AppConfig.strings.plannedPayments.formTitleEdit : AppConfig.strings.plannedPayments.formTitleNew}
                footerSlot={
                    <SubmitFooter
                        label={vm.isSubmitting ? AppConfig.strings.plannedPayments.savingLabel : AppConfig.strings.plannedPayments.saveLabel}
                        onPress={vm.handleSave}
                        disabled={!vm.isValid || vm.isSubmitting}
                    />
                }
            >
                <View style={styles.formSection}>
                    <AppCard padding="lg">
                        <AppInput
                            label={AppConfig.strings.plannedPayments.nameLabel}
                            value={vm.form.name}
                            onChangeText={(val) => vm.setForm({ ...vm.form, name: val })}
                            placeholder={AppConfig.strings.plannedPayments.namePlaceholder}
                        />

                        <AppInput
                            label={AppConfig.strings.plannedPayments.amountLabel}
                            value={vm.form.amount}
                            onChangeText={(val) => vm.setForm({ ...vm.form, amount: val })}
                            placeholder={AppConfig.strings.plannedPayments.amountPlaceholder}
                            keyboardType="numeric"
                        />

                        <AccountSelectionRow
                            title={AppConfig.strings.plannedPayments.fromAccountLabel}
                            accounts={accounts}
                            selectedAccountId={vm.form.fromAccountId}
                            placeholder={AppConfig.strings.plannedPayments.selectAccount}
                            onPress={() => setPickingAccountFor('from')}
                        />

                        <AccountSelectionRow
                            title={AppConfig.strings.plannedPayments.toAccountLabel}
                            accounts={accounts}
                            selectedAccountId={vm.form.toAccountId}
                            placeholder={AppConfig.strings.plannedPayments.selectAccount}
                            onPress={() => setPickingAccountFor('to')}
                        />
                    </AppCard>

                    <AppCard padding="lg" style={{ marginTop: Spacing.md }}>
                        <AppText variant="title" style={{ marginBottom: Spacing.sm }}>{AppConfig.strings.plannedPayments.recurrenceTitle}</AppText>

                        <ListRow
                            title={AppConfig.strings.plannedPayments.intervalLabel}
                            subtitle={vm.form.intervalType}
                            onPress={() => {
                                const types = Object.values(PlannedPaymentInterval);
                                const next = types[(types.indexOf(vm.form.intervalType) + 1) % types.length];

                                // Set defaults when changing type
                                const d = new Date(vm.form.startDate);
                                const updates: {
                                    intervalType: PlannedPaymentInterval;
                                    recurrenceDay?: number;
                                    recurrenceMonth?: number;
                                } = { intervalType: next };

                                if (next === PlannedPaymentInterval.WEEKLY) {
                                    updates.recurrenceDay = d.getDay();
                                } else if (next === PlannedPaymentInterval.MONTHLY) {
                                    updates.recurrenceDay = d.getDate();
                                } else if (next === PlannedPaymentInterval.YEARLY) {
                                    updates.recurrenceMonth = d.getMonth() + 1;
                                    updates.recurrenceDay = d.getDate();
                                }

                                vm.setForm({ ...vm.form, ...updates });
                            }}
                        />

                        {vm.form.intervalType === PlannedPaymentInterval.WEEKLY && (
                            <View style={styles.recurrenceOptions}>
                                <AppText variant="caption" style={{ marginBottom: Spacing.xs }}>{AppConfig.strings.plannedPayments.dayOfWeek}</AppText>
                                <View style={styles.chipContainer}>
                                    {AppConfig.strings.plannedPayments.dayNames.map((day, index) => (
                                        <TouchableOpacity
                                            key={day}
                                            style={[
                                                styles.chip,
                                                { backgroundColor: vm.form.recurrenceDay === index ? theme.primary : theme.surfaceSecondary }
                                            ]}
                                            onPress={() => vm.setForm({ ...vm.form, recurrenceDay: index })}
                                        >
                                            <AppText style={{ color: vm.form.recurrenceDay === index ? '#fff' : theme.textSecondary }}>{day}</AppText>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {vm.form.intervalType === PlannedPaymentInterval.MONTHLY && (
                            <View style={styles.recurrenceOptions}>
                                <AppInput
                                    label="Day of Month (1-31)"
                                    value={vm.form.recurrenceDay?.toString() || ''}
                                    onChangeText={(val) => {
                                        const day = parseInt(val);
                                        if (!isNaN(day) && day >= 1 && day <= 31) {
                                            vm.setForm({ ...vm.form, recurrenceDay: day });
                                        } else if (val === '') {
                                            vm.setForm({ ...vm.form, recurrenceDay: undefined });
                                        }
                                    }}
                                    keyboardType="numeric"
                                />
                            </View>
                        )}

                        {vm.form.intervalType === PlannedPaymentInterval.YEARLY && (
                            <View style={styles.recurrenceOptions}>
                                <ListRow
                                    title={AppConfig.strings.plannedPayments.month}
                                    subtitle={AppConfig.strings.plannedPayments.monthNames[(vm.form.recurrenceMonth || 1) - 1]}
                                    onPress={() => {
                                        const nextMonth = ((vm.form.recurrenceMonth || 1) % 12) + 1;
                                        vm.setForm({ ...vm.form, recurrenceMonth: nextMonth });
                                    }}
                                />
                                <AppInput
                                    label="Day of Month (1-31)"
                                    value={vm.form.recurrenceDay?.toString() || ''}
                                    onChangeText={(val) => {
                                        const day = parseInt(val);
                                        if (!isNaN(day) && day >= 1 && day <= 31) {
                                            vm.setForm({ ...vm.form, recurrenceDay: day });
                                        } else if (val === '') {
                                            vm.setForm({ ...vm.form, recurrenceDay: undefined });
                                        }
                                    }}
                                    keyboardType="numeric"
                                />
                            </View>
                        )}

                        <View style={styles.switchRow}>
                            <AppText>{AppConfig.strings.plannedPayments.autoPostLabel}</AppText>
                            <Switch
                                value={vm.form.isAutoPost}
                                onValueChange={(val) => vm.setForm({ ...vm.form, isAutoPost: val })}
                            />
                        </View>
                    </AppCard>
                </View>
            </FormScreenScaffold>

            <AccountPickerModal
                visible={pickingAccountFor !== null}
                accounts={accounts}
                selectedId={pickingAccountFor === 'from' ? vm.form.fromAccountId : vm.form.toAccountId}
                onClose={() => setPickingAccountFor(null)}
                onSelect={(accId: string) => {
                    if (pickingAccountFor === 'from') {
                        vm.setForm({ ...vm.form, fromAccountId: accId });
                    } else {
                        vm.setForm({ ...vm.form, toAccountId: accId });
                    }
                    setPickingAccountFor(null);
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
    },
    formSection: {
        padding: Spacing.lg,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    recurrenceOptions: {
        marginTop: Spacing.sm,
        paddingHorizontal: Spacing.xs,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    chip: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: 16,
        minWidth: 50,
        alignItems: 'center',
    },
});
