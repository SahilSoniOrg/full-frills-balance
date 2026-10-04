import { AccountPickerModal } from '@/src/components/account-selection';
import { AccountSelectionRow } from '@/src/components/accounts/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { FormHeroSection } from '@/src/components/forms/FormHeroSection';
import { FormField } from '@/src/components/forms/FormField';
import { RecurrenceField } from '@/src/components/forms/RecurrenceField';
import { FormSectionGroup } from '@/src/components/forms/FormSectionGroup';
import { FormSelectorField } from '@/src/components/forms/FormSelectorField';
import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { CurrencySelector } from '@/src/features/accounts';
import { Icon, AppInput, AppSegmentedControl, AppToggle, ListRow } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { Box, FadeIn, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { PlannedPaymentFormScreenModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';

export type PlannedPaymentFormViewProps = PlannedPaymentFormScreenModel & {
  id?: string;
};

export function PlannedPaymentFormView({
  id,
  accounts,
  currencies,
  form,
  isValid,
  requirementHint,
  isSubmitting,
  handleSave,
  onBack,
  setField,
  pickerState,
}: PlannedPaymentFormViewProps) {
  const { theme } = useTheme();
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: id
        ? AppConfig.strings.plannedPayments.formTitleEdit
        : AppConfig.strings.plannedPayments.formTitleNew,
      showBack: true,
      backIcon: Icon.Back,
      onBack,
    }),
    [id, onBack],
  );

  return (
    <>
      <EntityFormScreen
        chrome={chrome}
        submitAction={{
          label: vmLabel(isSubmitting),
          onPress: handleSave,
          disabled: !isValid || isSubmitting,
          requirementHint,
        }}
      >
        <Box paddingTop="md">
          <FormHeroSection
            nameLabel="Payment name"
            nameValue={form.name}
            onNameChange={(val: string) => setField('name', val)}
            namePlaceholder={AppConfig.strings.plannedPayments.namePlaceholder}
            amountLabel="Amount"
            amountValue={form.amount}
            onAmountChange={(val: string) => setField('amount', val)}
            currencySymbol={CURRENCY_SYMBOLS[form.currencyCode] || form.currencyCode}
            footer={
              <CurrencySelector
                variant="pill"
                selectedCurrency={form.currencyCode}
                currencies={currencies}
                onSelect={code => setField('currencyCode', code)}
              />
            }
          />
        </Box>

        <Stack space="xl" style={styles.formSection}>
          <FormSectionGroup title="Accounts">
            <Stack space="md" paddingHorizontal="md">
              <AccountSelectionRow
                testID="planned-payment-from-account"
                title={AppConfig.strings.plannedPayments.fromAccountLabel}
                accounts={accounts}
                selectedAccountId={form.fromAccountId}
                placeholder={AppConfig.strings.plannedPayments.selectAccount}
                onPress={() => pickerState.open('from')}
                style={{
                  paddingHorizontal: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              />

              <AccountSelectionRow
                testID="planned-payment-to-account"
                title={AppConfig.strings.plannedPayments.toAccountLabel}
                accounts={accounts}
                selectedAccountId={form.toAccountId}
                placeholder={AppConfig.strings.plannedPayments.selectAccount}
                onPress={() => pickerState.open('to')}
                style={{ paddingHorizontal: 0 }}
              />
            </Stack>
          </FormSectionGroup>

          <FormSectionGroup title={AppConfig.strings.plannedPayments.recurrenceTitle}>
            <Stack space="lg" paddingHorizontal="md">
              <FormSelectorField
                label="Starts"
                value={formatDate(form.startDate)}
                onPress={() => setPickingDate('start')}
                testID="planned-payment-start-date"
              />

              <RecurrenceField
                intervalType={form.intervalType}
                value={form.intervalN}
                onChange={value => setField('intervalN', value)}
                onIntervalTypeChange={type => setField('intervalType', type)}
                testID="planned-payment-repeat-count"
              />

              {form.intervalType === PlannedPaymentInterval.WEEKLY && (
                <FadeIn fromY={5} duration={300}>
                  <FormField label="Day of Week">
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={AppConfig.strings.plannedPayments.dayNames.map((day, index) => ({
                        id: index,
                        label: day,
                      }))}
                      value={form.recurrenceDay ?? 0}
                      onChange={val => setField('recurrenceDay', val)}
                    />
                  </FormField>
                </FadeIn>
              )}

              {form.intervalType === PlannedPaymentInterval.MONTHLY && (
                <FadeIn fromY={5} duration={300}>
                  <FormField label="Day of Month">
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                        id: day,
                        label: day.toString(),
                      }))}
                      value={form.recurrenceDay ?? 1}
                      onChange={val => setField('recurrenceDay', val)}
                    />
                  </FormField>
                </FadeIn>
              )}

              {form.intervalType === PlannedPaymentInterval.YEARLY && (
                <FadeIn fromY={5} duration={300}>
                  <Stack space="lg">
                    <FormField label="Month">
                      <AppSegmentedControl<number>
                        scrollable
                        variant="minimal"
                        size="sm"
                        options={AppConfig.strings.plannedPayments.monthNames.map(
                          (month, index) => ({
                            id: index + 1,
                            label: month,
                          }),
                        )}
                        value={form.recurrenceMonth ?? 1}
                        onChange={val => setField('recurrenceMonth', val)}
                      />
                    </FormField>

                    <FormField label="Day of Month">
                      <AppSegmentedControl<number>
                        scrollable
                        variant="minimal"
                        size="sm"
                        options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                          id: day,
                          label: day.toString(),
                        }))}
                        value={form.recurrenceDay ?? 1}
                        onChange={val => setField('recurrenceDay', val)}
                      />
                    </FormField>
                  </Stack>
                </FadeIn>
              )}

              <FormSelectorField
                label="Ends"
                value={form.endDate ? formatDate(form.endDate) : ''}
                placeholder="Never"
                onPress={() => setPickingDate('end')}
                onClear={() => setField('endDate', undefined)}
                testID="planned-payment-end-date"
              />

              <FormField label="Automatically record entry">
                <ListRow
                  padding="sm"
                  title="Save automatically"
                  subtitle="Creates an entry on the scheduled date"
                  trailing={
                    <AppToggle
                      value={form.isAutoPost}
                      onValueChange={val => setField('isAutoPost', val)}
                      accessibilityLabel="Save automatically"
                    />
                  }
                />
              </FormField>
            </Stack>
          </FormSectionGroup>

          <FormSectionGroup title="Note">
            <Box paddingHorizontal="md">
              <AppInput
                value={form.description}
                onChangeText={val => setField('description', val)}
                placeholder="Add a note (optional)"
                multiline
                numberOfLines={3}
                containerStyle={{ marginBottom: 0 }}
                testID="planned-payment-note"
              />
            </Box>
          </FormSectionGroup>
        </Stack>
      </EntityFormScreen>

      <DateTimePickerModal
        visible={pickingDate !== null}
        hideTime
        date={dayjs(
          pickingDate === 'end' ? (form.endDate ?? form.startDate) : form.startDate,
        ).format('YYYY-MM-DD')}
        time="00:00"
        onClose={() => setPickingDate(null)}
        onSelect={date => {
          const value = dayjs(date).startOf('day').valueOf();
          if (pickingDate === 'end') setField('endDate', value);
          else setField('startDate', value);
          setPickingDate(null);
        }}
      />

      <AccountPickerModal
        visible={pickerState.visible}
        accounts={accounts}
        selectedId={pickerState.selectedId}
        onClose={pickerState.close}
        onSelect={pickerState.onSelect}
      />
    </>
  );
}

function vmLabel(isSubmitting: boolean) {
  return isSubmitting
    ? AppConfig.strings.plannedPayments.savingLabel
    : AppConfig.strings.plannedPayments.saveLabel;
}

const styles = StyleSheet.create({
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
