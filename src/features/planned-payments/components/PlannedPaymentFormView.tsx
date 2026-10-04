import { AccountPickerModal } from '@/src/components/account-selection';
import { CurrencyPickerSheet } from '@/src/components/filters/CurrencyPickerSheet';
import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { AmountHero, FormRow, ScheduleField, UnderlineNameField } from '@/src/components/forms';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppButton, AppIcon, AppInput, AppToggle, Icon } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { plannedPaymentFormStrings as copy } from '@/src/constants/copy/domains/plannedPaymentFormStrings';
import { PlannedPaymentDestinationPicker } from '@/src/features/planned-payments/components/PlannedPaymentDestinationPicker';
import type { PlannedPaymentFormScreenModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentFormScreen';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { formatDate } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  pickerState,
}: PlannedPaymentFormViewProps) {
  const { theme } = useTheme();
  const [pickingDate, setPickingDate] = useState<'start' | 'end' | null>(null);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [noteVisible, setNoteVisible] = useState(false);
  const fromAccount = accounts.find(account => account.id === form.fromAccountId);
  const toAccount = accounts.find(account => account.id === form.toAccountId);

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
        <View style={styles.formContent}>
          <AmountHero
            value={form.amount}
            onChange={value => setField('amount', value)}
            currencySymbol={CURRENCY_SYMBOLS[form.currencyCode] || form.currencyCode}
            currencyCode={form.currencyCode}
            onCurrencyPress={() => setCurrencyPickerVisible(true)}
            autoFocus={autoFocusAmount}
            precision={currencies.find(currency => currency.code === form.currencyCode)?.precision}
          />

          <View style={styles.nameField}>
            <UnderlineNameField
              value={form.name}
              onChangeText={value => setField('name', value)}
              placeholder={copy.namePlaceholder}
            />
          </View>

          <FormRow
            icon={fromAccount ? getAccountIcon(fromAccount) : Icon.Wallet}
            title={copy.from}
            value={fromAccount?.name}
            placeholder={copy.selectAccount}
            onPress={() => pickerState.open('from')}
            testID="planned-payment-from-account"
          />
          <View style={styles.swapRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.swapAccounts}
              testID="planned-payment-swap"
              onPress={swapAccounts}
              style={styles.swapButton}
              hitSlop={8}
            >
              <AppIcon name={Icon.SwapHorizontal} size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <FormRow
            icon={toAccount ? getAccountIcon(toAccount) : Icon.Tag}
            title={copy.to}
            value={toAccount?.name}
            placeholder={copy.selectAccount}
            onPress={() => pickerState.open('to')}
            testID="planned-payment-to-account"
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
            subtitle={copy.automaticDescription}
            trailing={
              <AppToggle
                value={form.isAutoPost}
                onValueChange={value => setField('isAutoPost', value)}
                accessibilityLabel={copy.recordAutomatically}
              />
            }
            showSeparator
          />
          <FormRow
            icon={Icon.Document}
            title={copy.note}
            value={form.description.trim() || undefined}
            placeholder={copy.addNote}
            onPress={() => setNoteVisible(true)}
            testID="planned-payment-note"
            showSeparator={false}
          />
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

      <AccountPickerModal
        visible={pickerState.visible && pickerState.target === 'from'}
        accounts={pickerState.accounts}
        selectedId={pickerState.selectedId}
        onClose={pickerState.close}
        onSelect={pickerState.onSelect}
      />

      <PlannedPaymentDestinationPicker
        visible={pickerState.visible && pickerState.target === 'to'}
        accounts={pickerState.accounts}
        selectedId={form.toAccountId}
        onClose={pickerState.close}
        onSelect={pickerState.onSelect}
      />

      <CurrencyPickerSheet
        visible={currencyPickerVisible}
        title={AppConfig.strings.accounts.selectCurrency}
        currencies={currencies}
        selectedCode={form.currencyCode}
        selectedBackgroundColor={theme.primaryLight}
        searchPlaceholder={AppConfig.strings.common.searchPlaceholder}
        onClose={() => setCurrencyPickerVisible(false)}
        onSelect={code => {
          setField('currencyCode', code);
          setCurrencyPickerVisible(false);
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
  formContent: {
    paddingTop: Spacing.xs,
  },
  nameField: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  swapRow: {
    height: Size.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: Spacing.xl,
  },
  swapButton: {
    width: Size.touchTarget,
    height: Size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleField: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xs,
  },
  noteFooter: {
    paddingTop: Spacing.md,
  },
});
