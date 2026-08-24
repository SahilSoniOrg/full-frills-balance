import { AccountPickerModal } from '@/src/features/accounts';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormField } from '@/src/components/common/FormField';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { AppSegmentedControl, AppToggle, ListRow } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { FadeIn, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { PlannedPaymentFormScreenModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';

export type PlannedPaymentFormViewProps = PlannedPaymentFormScreenModel & {
  id?: string;
};

export function PlannedPaymentFormView({
  id,
  accounts,
  form,
  isValid,
  isSubmitting,
  handleSave,
  onBack,
  setField,
  pickerState,
}: PlannedPaymentFormViewProps) {
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: id
        ? AppConfig.strings.plannedPayments.formTitleEdit
        : AppConfig.strings.plannedPayments.formTitleNew,
      showBack: true,
      backIcon: 'back',
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
        }}
      >
        <FormHeroSection
          nameLabel="Rule Name"
          nameValue={form.name}
          onNameChange={(val: string) => setField('name', val)}
          namePlaceholder={AppConfig.strings.plannedPayments.namePlaceholder}
          amountLabel="Amount"
          amountValue={form.amount}
          onAmountChange={(val: string) => setField('amount', val)}
          currencySymbol={CURRENCY_SYMBOLS[form.currencyCode] || form.currencyCode}
        />

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
              <FormField label="Interval">
                <AppSegmentedControl
                  flex
                  variant="minimal"
                  options={[
                    { id: PlannedPaymentInterval.DAILY, label: 'Daily' },
                    { id: PlannedPaymentInterval.WEEKLY, label: 'Weekly' },
                    { id: PlannedPaymentInterval.MONTHLY, label: 'Monthly' },
                    { id: PlannedPaymentInterval.YEARLY, label: 'Yearly' },
                  ]}
                  value={form.intervalType}
                  onChange={val => setField('intervalType', val)}
                />
              </FormField>

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

              <FormField label="Auto-Post">
                <ListRow
                  padding="sm"
                  title="Post Automatically"
                  subtitle="To ledger on due date"
                  trailing={
                    <AppToggle
                      value={form.isAutoPost}
                      onValueChange={val => setField('isAutoPost', val)}
                    />
                  }
                />
              </FormField>
            </Stack>
          </FormSectionGroup>
        </Stack>
      </EntityFormScreen>

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
