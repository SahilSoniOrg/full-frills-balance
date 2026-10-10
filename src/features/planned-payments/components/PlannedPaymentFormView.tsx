import { SimpleFormAccountSections } from '@/src/components/account-selection/SimpleFormAccountSections';
import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { FormRow, ScheduleField, UnderlineNameField } from '@/src/components/forms';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppButton, AppInput, AppToggle, Icon, ListGroup } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { plannedPaymentFormStrings as copy } from '@/src/constants/copy/domains/plannedPaymentFormStrings';
import { PlannedPaymentFxCard } from './PlannedPaymentFxCard';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import type { PlannedPaymentFormScreenModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentForm';
import { formatDate } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export type PlannedPaymentFormViewProps = PlannedPaymentFormScreenModel & {
  id?: string;
};

export function PlannedPaymentFormView({
  id,
  accounts,
  currencies,
  form,
  schedule,
  autoFocusAmount,
  isValid,
  requirementHint,
  isSubmitting,
  handleSave,
  onBack,
  setField,
  setSchedule,
  swapAccounts,
  sourceAccount,
  destinationAccount,
  destinationPrecision,
  fxPair,
  setFxMode,
  refreshFx,
  expansionPosition,
  toggleAccountExpansion,
  selectSource,
  selectDestination,
}: PlannedPaymentFormViewProps) {
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);
  const [noteVisible, setNoteVisible] = useState(false);

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: id ? copy.formTitleEdit : copy.formTitleNew,
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
          label: isSubmitting ? copy.saving : copy.save,
          onPress: handleSave,
          disabled: !isValid || isSubmitting,
          requirementHint,
        }}
      >
        <View>
          <View style={styles.amountField}>
            <CalculatorAmountInput
              variant="centered"
              value={form.amount}
              onChangeText={value => setField('amount', value)}
              currencySymbol={CURRENCY_SYMBOLS[form.currencyCode] || form.currencyCode}
              label={form.currencyCode}
              autoFocus={autoFocusAmount}
              precision={
                currencies.find(currency => currency.code === form.currencyCode)?.precision ??
                CurrencyFormatter.getPrecisionFallback(form.currencyCode)
              }
            />
          </View>

          <View style={styles.nameField}>
            <UnderlineNameField
              value={form.name}
              onChangeText={value => setField('name', value)}
              placeholder={copy.namePlaceholder}
            />
          </View>

          <PlannedPaymentFxCard
            key={`${form.fromAccountId}:${form.toAccountId}:${form.fxMode ?? 'legacy'}`}
            pair={fxPair}
            destinationAmount={form.destinationAmount}
            mode={form.fxMode}
            onModeChange={setFxMode}
            onAmountChange={value => setField('destinationAmount', value)}
            onRefresh={() => {
              setField('destinationAmount', undefined);
              refreshFx();
            }}
            precision={destinationPrecision}
          />
          <SimpleFormAccountSections
            sourceLabel={copy.from}
            sourceAccount={sourceAccount}
            sourceAccounts={accounts}
            onSelectSource={selectSource}
            destLabel={copy.to}
            destAccount={destinationAccount}
            destAccounts={accounts}
            onSelectDestination={selectDestination}
            destEmptyPrompt={copy.selectAccount}
            expansionPosition={expansionPosition}
            onToggleExpansion={toggleAccountExpansion}
            type="transfer"
            onSwapAccounts={swapAccounts}
            allAccounts={accounts}
            lazyDropdown
            testIDPrefix="planned-payment"
          />

          <View style={styles.scheduleField}>
            <ScheduleField
              label={copy.repeats}
              value={schedule}
              startDate={form.startDate}
              onChange={setSchedule}
              testID="planned-payment-repeat-count"
            />
          </View>

          <ListGroup variant="plain">
            <FormRow
              icon={Icon.Calendar}
              title={copy.starts}
              value={formatDate(form.startDate)}
              onPress={() => setPickingDate('start')}
              testID="planned-payment-start-date"
            />
            <FormRow
              icon={Icon.Repeat}
              title={copy.ends}
              value={form.endDate ? formatDate(form.endDate) : undefined}
              placeholder={copy.never}
              onPress={() => setPickingDate('end')}
              onClear={() => setField('endDate', undefined)}
              testID="planned-payment-end-date"
            />
            <FormRow
              icon={Icon.Refresh}
              title={copy.recordAutomatically}
              subtitle={
                form.fxMode === 'manual' ? copy.fxManualRecording : copy.automaticDescription
              }
              trailing={
                <AppToggle
                  value={form.fxMode === 'manual' ? false : form.isAutoPost}
                  disabled={form.fxMode === 'manual'}
                  onValueChange={value => setField('isAutoPost', value)}
                  accessibilityLabel={copy.recordAutomatically}
                />
              }
            />
            <FormRow
              icon={Icon.Document}
              title={copy.note}
              value={form.description.trim() || undefined}
              placeholder={copy.addNote}
              onPress={() => setNoteVisible(true)}
              testID="planned-payment-note"
            />
          </ListGroup>
        </View>
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

      <ModalSurface
        visible={noteVisible}
        title={copy.editNote}
        onClose={() => setNoteVisible(false)}
        position="bottomSheet"
        fixedHeight={false}
        scrollable={false}
        closeTestID="planned-payment-note-close"
        footer={
          <View style={styles.noteFooter}>
            <AppButton onPress={() => setNoteVisible(false)}>{copy.saveNote}</AppButton>
          </View>
        }
      >
        <AppInput
          value={form.description}
          onChangeText={value => setField('description', value)}
          placeholder={copy.notePlaceholder}
          multiline
          numberOfLines={5}
          testID="planned-payment-note-input"
        />
      </ModalSurface>
    </>
  );
}

const styles = StyleSheet.create({
  amountField: {
    paddingHorizontal: Spacing.lg,
  },
  nameField: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  scheduleField: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  noteFooter: {
    paddingTop: Spacing.md,
  },
});
