import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { AppInput, AppText, ListRow } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';
import { usePlannedPaymentFormScreen } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

export default function PlannedPaymentFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = usePlannedPaymentFormScreen(id);
  const { theme } = useTheme();

  return (
    <>
      <EntityFormScreen
        title={
          id
            ? AppConfig.strings.plannedPayments.formTitleEdit
            : AppConfig.strings.plannedPayments.formTitleNew
        }
        submitAction={{
          label: vm.isSubmitting
            ? AppConfig.strings.plannedPayments.savingLabel
            : AppConfig.strings.plannedPayments.saveLabel,
          onPress: vm.handleSave,
          disabled: !vm.isValid || vm.isSubmitting,
        }}
      >
        <View style={styles.formSection}>
          <FormSectionGroup title="Details">
            <AppInput
              label={AppConfig.strings.plannedPayments.nameLabel}
              value={vm.form.name}
              onChangeText={(val: string) => vm.setField('name', val)}
              placeholder={AppConfig.strings.plannedPayments.namePlaceholder}
            />

            <AppInput
              label={AppConfig.strings.plannedPayments.amountLabel}
              value={vm.form.amount}
              onChangeText={(val: string) => vm.setField('amount', val)}
              placeholder={AppConfig.strings.plannedPayments.amountPlaceholder}
              keyboardType="numeric"
            />

            <AccountSelectionRow
              title={AppConfig.strings.plannedPayments.fromAccountLabel}
              accounts={vm.accounts}
              selectedAccountId={vm.form.fromAccountId}
              placeholder={AppConfig.strings.plannedPayments.selectAccount}
              onPress={() => vm.pickerState.open('from')}
            />

            <AccountSelectionRow
              title={AppConfig.strings.plannedPayments.toAccountLabel}
              accounts={vm.accounts}
              selectedAccountId={vm.form.toAccountId}
              placeholder={AppConfig.strings.plannedPayments.selectAccount}
              onPress={() => vm.pickerState.open('to')}
            />
          </FormSectionGroup>

          <FormSectionGroup title={AppConfig.strings.plannedPayments.recurrenceTitle}>
            <ListRow
              title={AppConfig.strings.plannedPayments.intervalLabel}
              subtitle={vm.form.intervalType}
              onPress={vm.cycleIntervalType}
            />

            {vm.form.intervalType === PlannedPaymentInterval.WEEKLY && (
              <View style={styles.recurrenceOptions}>
                <AppText variant="caption" style={{ marginBottom: Spacing.xs }}>
                  {AppConfig.strings.plannedPayments.dayOfWeek}
                </AppText>
                <View style={styles.chipContainer}>
                  {AppConfig.strings.plannedPayments.dayNames.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            vm.form.recurrenceDay === index
                              ? theme.primary
                              : theme.surfaceSecondary,
                        },
                      ]}
                      onPress={() => vm.setField('recurrenceDay', index)}
                    >
                      <AppText
                        style={{
                          color: vm.form.recurrenceDay === index ? '#fff' : theme.textSecondary,
                        }}
                      >
                        {day}
                      </AppText>
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
                  onChangeText={vm.setRecurrenceDayFromInput}
                  keyboardType="numeric"
                />
              </View>
            )}

            {vm.form.intervalType === PlannedPaymentInterval.YEARLY && (
              <View style={styles.recurrenceOptions}>
                <ListRow
                  title={AppConfig.strings.plannedPayments.month}
                  subtitle={
                    AppConfig.strings.plannedPayments.monthNames[(vm.form.recurrenceMonth || 1) - 1]
                  }
                  onPress={vm.cycleRecurrenceMonth}
                />
                <AppInput
                  label="Day of Month (1-31)"
                  value={vm.form.recurrenceDay?.toString() || ''}
                  onChangeText={vm.setRecurrenceDayFromInput}
                  keyboardType="numeric"
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <AppText>{AppConfig.strings.plannedPayments.autoPostLabel}</AppText>
              <Switch
                value={vm.form.isAutoPost}
                onValueChange={val => vm.setField('isAutoPost', val)}
              />
            </View>
          </FormSectionGroup>
        </View>
      </EntityFormScreen>

      <AccountPickerModal
        visible={vm.pickerState.visible}
        accounts={vm.accounts}
        selectedId={vm.pickerState.selectedId}
        onClose={vm.pickerState.close}
        onSelect={vm.pickerState.onSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {},
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
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
