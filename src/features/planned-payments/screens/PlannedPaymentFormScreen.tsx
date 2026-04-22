import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { SectionLabel } from '@/src/components/common/SectionLabel';
import { AppSegmentedControl, AppToggle, ListRow } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';
import { Box, FadeIn, Stack, Text } from '@/src/design-system';
import { usePlannedPaymentFormScreen } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useTheme } from '@/src/hooks/use-theme';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

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
        <FormHeroSection
          nameLabel="Rule Name"
          nameValue={vm.form.name}
          onNameChange={(val: string) => vm.setField('name', val)}
          namePlaceholder={AppConfig.strings.plannedPayments.namePlaceholder}
          amountLabel="Amount"
          amountValue={vm.form.amount}
          onAmountChange={(val: string) => vm.setField('amount', val)}
        />

        <Stack space="xl" style={styles.formSection}>
          <FormSectionGroup title="Accounts">
            <Stack space="md" paddingHorizontal="md">
              <AccountSelectionRow
                title={AppConfig.strings.plannedPayments.fromAccountLabel}
                accounts={vm.accounts}
                selectedAccountId={vm.form.fromAccountId}
                placeholder={AppConfig.strings.plannedPayments.selectAccount}
                onPress={() => vm.pickerState.open('from')}
                style={{
                  paddingHorizontal: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              />

              <AccountSelectionRow
                title={AppConfig.strings.plannedPayments.toAccountLabel}
                accounts={vm.accounts}
                selectedAccountId={vm.form.toAccountId}
                placeholder={AppConfig.strings.plannedPayments.selectAccount}
                onPress={() => vm.pickerState.open('to')}
                style={{ paddingHorizontal: 0 }}
              />
            </Stack>
          </FormSectionGroup>

          <FormSectionGroup title={AppConfig.strings.plannedPayments.recurrenceTitle}>
            <Stack space="lg" paddingHorizontal="md">
              <Box>
                <SectionLabel label="Interval" marginTop="none" />
                <AppSegmentedControl
                  flex
                  variant="minimal"
                  options={[
                    { id: PlannedPaymentInterval.DAILY, label: 'Daily' },
                    { id: PlannedPaymentInterval.WEEKLY, label: 'Weekly' },
                    { id: PlannedPaymentInterval.MONTHLY, label: 'Monthly' },
                    { id: PlannedPaymentInterval.YEARLY, label: 'Yearly' },
                  ]}
                  value={vm.form.intervalType}
                  onChange={val => vm.setField('intervalType', val)}
                />
              </Box>

              {vm.form.intervalType === PlannedPaymentInterval.WEEKLY && (
                <FadeIn fromY={5} duration={300}>
                  <Box>
                    <SectionLabel
                      label="Day of Week"
                      style={{ marginLeft: Spacing.md }}
                      marginTop="none"
                    />
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={AppConfig.strings.plannedPayments.dayNames.map((day, index) => ({
                        id: index,
                        label: day,
                      }))}
                      value={vm.form.recurrenceDay ?? 0}
                      onChange={val => vm.setField('recurrenceDay', val)}
                    />
                  </Box>
                </FadeIn>
              )}

              {vm.form.intervalType === PlannedPaymentInterval.MONTHLY && (
                <FadeIn fromY={5} duration={300}>
                  <Box>
                    <SectionLabel
                      label="Day of Month"
                      style={{ marginLeft: Spacing.md }}
                      marginTop="none"
                    />
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                        id: day,
                        label: day.toString(),
                      }))}
                      value={vm.form.recurrenceDay ?? 1}
                      onChange={val => vm.setField('recurrenceDay', val)}
                    />
                  </Box>
                </FadeIn>
              )}

              {vm.form.intervalType === PlannedPaymentInterval.YEARLY && (
                <FadeIn fromY={5} duration={300}>
                  <Stack space="lg">
                    <Box>
                      <SectionLabel
                        label="Month"
                        style={{ marginLeft: Spacing.md }}
                        marginTop="none"
                      />
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
                        value={vm.form.recurrenceMonth ?? 1}
                        onChange={val => vm.setField('recurrenceMonth', val)}
                      />
                    </Box>

                    <Box>
                      <SectionLabel
                        label="Day of Month"
                        style={{ marginLeft: Spacing.md }}
                        marginTop="none"
                      />
                      <AppSegmentedControl<number>
                        scrollable
                        variant="minimal"
                        size="sm"
                        options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                          id: day,
                          label: day.toString(),
                        }))}
                        value={vm.form.recurrenceDay ?? 1}
                        onChange={val => vm.setField('recurrenceDay', val)}
                      />
                    </Box>
                  </Stack>
                </FadeIn>
              )}

              <ListRow
                padding="sm"
                title={
                  <Box>
                    <SectionLabel label="Auto-Post" marginTop="none" style={{ marginBottom: 4 }} />
                    <Text weight="medium">Post Automatically</Text>
                  </Box>
                }
                subtitle="To ledger on due date"
                trailing={
                  <AppToggle
                    value={vm.form.isAutoPost}
                    onValueChange={val => vm.setField('isAutoPost', val)}
                  />
                }
              />
            </Stack>
          </FormSectionGroup>
        </Stack>
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
  formSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
