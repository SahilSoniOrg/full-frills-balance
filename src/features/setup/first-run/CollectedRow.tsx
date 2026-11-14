import {
  AppCard,
  AppIcon,
  AppText,
  FilterChipButton,
  PressScaleTouchable,
  SwipeToRemove,
} from '@/src/components/core';
import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { SelectionPickerSheet } from '@/src/components/filters/SelectionPickerSheet';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Size, Spacing, Typography } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { getLocales } from 'expo-localization';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { amountIssueMessage, currencyPrecision, formatAmountInput, parseAmountInput } from './amountValidation';
import { MAX_ONBOARDING_ITEM_NAME_LENGTH } from './validation';

export type CadenceId = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';

type CollectedItemBase = {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  readonly amountText?: string;
  readonly amountError?: string | null;
  readonly amountLabel: string;
  readonly locale?: string;
  readonly icon?: IconName;
  readonly onRename: (title: string) => void;
  readonly onAmountChange: (amount: number) => void;
  readonly onAmountTextChange?: (raw: string) => void;
  readonly onRemove: () => void;
};

type AccountCollectedItem = CollectedItemBase & {
  readonly kind: 'account';
  readonly detail:
    | { readonly kind: 'plain' }
    | {
        readonly kind: 'savings';
        readonly options: readonly { id: string; label: string }[];
        readonly selectedId?: string;
        readonly issue?: string;
        readonly onSelect: (choiceId: string) => void;
      }
    | {
        readonly kind: 'card';
        readonly paymentPlan: { amount: number; date: number; dateLabel: string };
        readonly paymentAmountText?: string;
        readonly paymentAmountError?: string | null;
        readonly onPaymentAmountTextChange?: (raw: string) => void;
        readonly onAmountChange: (amount: number | undefined) => void;
        readonly onDateChange: (date: number) => void;
      };
};

type IncomeCollectedItem = CollectedItemBase & {
  readonly kind: 'income';
  readonly cadence: {
    readonly intervals: readonly { id: CadenceId; label: string }[];
    readonly selectedInterval: CadenceId;
    readonly date: number;
    readonly dateLabel: string;
  };
  readonly onIntervalChange: (interval: CadenceId) => void;
  readonly onDateChange: (date: number) => void;
};

type PaymentCollectedItem = CollectedItemBase & {
  readonly kind: 'payment';
  readonly date: number;
  readonly dateLabel: string;
  readonly onDateChange: (date: number) => void;
};

type BudgetCollectedItem = CollectedItemBase & { readonly kind: 'budget' };

export type CollectedItem =
  AccountCollectedItem | IncomeCollectedItem | PaymentCollectedItem | BudgetCollectedItem;

export function CollectedRow({
  item,
  currency,
  locale: providedLocale,
}: {
  readonly item: CollectedItem;
  readonly currency: string;
  readonly locale?: string;
}) {
  const locale = providedLocale ?? item.locale ?? getLocales()[0]?.languageTag ?? 'en-US';
  const { theme, tokens, fonts } = useTheme();
  const [name, setName] = useState(item.title);
  const amountFallback = item.kind === 'account' || item.amount !== 0 ? formatAmountInput(item.amount, locale) : '';
  const [localAmount, setLocalAmount] = useState<{ source: string; text: string }>();
  const amountText = item.amountText ?? (localAmount?.source === amountFallback ? localAmount.text : amountFallback);
  const [editingName, setEditingName] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const shownName = editingName ? name : item.title;
  const parsedAmount = parseAmountInput(amountText, locale, currencyPrecision(currency));
  const positiveOnly = item.kind !== 'account';
  const signedAllowed = item.kind === 'account' && item.detail.kind !== 'card';
  const amountIssue =
    item.amountError !== undefined
      ? item.amountError ?? undefined
      : amountTouched
        ? amountIssueMessage(parsedAmount, positiveOnly, signedAllowed)
        : undefined;
  const removeLabel = `${copy.removeItem} ${item.title}`;

  return (
    <SwipeToRemove label={removeLabel} onRemove={item.onRemove}>
      <AppCard
        variant="outline"
        background="surface"
        paddingSize="none"
      >
        <Box paddingHorizontal="xl" paddingVertical="sm">
          <Stack gap="xs">
            <Inline align="center" gap="sm" wrap>
              <Stack flex={1} gap="xs">
                <Inline align="center" gap="sm">
                  {item.icon ? (
                    <AppIcon name={item.icon} size={Size.iconXs} color="textSecondary" />
                  ) : null}
                  <TextInput
                    value={shownName}
                    onChangeText={setName}
                    maxLength={MAX_ONBOARDING_ITEM_NAME_LENGTH}
                    returnKeyType="done"
                    onFocus={() => {
                      setName(item.title);
                      setEditingName(true);
                    }}
                    onBlur={() => {
                      setEditingName(false);
                      item.onRename(name);
                    }}
                    onSubmitEditing={() => {
                      setEditingName(false);
                      item.onRename(name);
                    }}
                    accessibilityLabel={item.title}
                    testID={`onboarding-name-${item.id}`}
                    style={[
                      styles.rowInput,
                      styles.nameInput,
                      { color: theme.text, fontFamily: fonts.regular },
                    ]}
                  />
                </Inline>
                <AppText variant="caption" color="secondary">
                  {item.amountLabel}
                </AppText>
              </Stack>
              <Box style={styles.amountHit}>
                <Stack gap="xs" align="flex-end">
                  <Inline align="center" gap="xs">
                    <AppText variant="body" color="secondary">
                      {symbol}
                    </AppText>
                    <TextInput
                      value={amountText}
                      onChangeText={text => {
                        if (!item.onAmountTextChange) setLocalAmount({ source: amountFallback, text });
                        setAmountTouched(true);
                        item.onAmountTextChange?.(text);
                        const parsed = parseAmountInput(text, locale, currencyPrecision(currency));
                        if (
                          parsed.status === 'valid' &&
                          !amountIssueMessage(parsed, positiveOnly, signedAllowed)
                        ) {
                          item.onAmountChange(parsed.value);
                        }
                      }}
                      keyboardType={
                        signedAllowed
                          ? Platform.OS === 'ios'
                            ? 'numbers-and-punctuation'
                            : 'default'
                          : 'decimal-pad'
                      }
                      placeholder=""
                      placeholderTextColor={tokens.input.placeholder}
                      accessibilityLabel={`${item.title}, ${item.amountLabel}`}
                      accessibilityHint={amountIssue}
                      testID={`onboarding-amount-${item.id}`}
                      style={[
                        styles.rowInput,
                        styles.amountInput,
                        {
                          color: theme.text,
                          fontFamily: (fonts.numeric ?? fonts).semibold,
                          fontVariant: ['tabular-nums', 'lining-nums'],
                        },
                      ]}
                    />
                  </Inline>
                  {amountIssue ? (
                    <AppText variant="caption" color="error" align="right">
                      {amountIssue}
                    </AppText>
                  ) : null}
                </Stack>
              </Box>
              <PressScaleTouchable
                haptic="selection"
                onPress={item.onRemove}
                accessibilityRole="button"
                accessibilityLabel={removeLabel}
                accessibilityHint="Removes this entry."
                testID={`onboarding-remove-${item.id}`}
                style={styles.removeButton}
              >
                <AppIcon name={Icon.Delete} size={Size.iconSm} color="error" />
              </PressScaleTouchable>
            </Inline>
            {item.kind === 'account' ? (
              <AccountDetails
                detail={item.detail}
                currency={currency}
                itemId={item.id}
                locale={locale}
              />
            ) : null}
            {item.kind === 'income' ? <IncomeDetails item={item} /> : null}
            {item.kind === 'payment' ? <PaymentDetails item={item} /> : null}
          </Stack>
        </Box>
      </AppCard>
    </SwipeToRemove>
  );
}

function AccountDetails({
  detail,
  currency,
  itemId,
  locale,
}: {
  readonly detail: AccountCollectedItem['detail'];
  readonly currency: string;
  readonly itemId: string;
  readonly locale: string;
}) {
  if (detail.kind === 'plain') return null;
  if (detail.kind === 'savings') {
    return (
      <Stack gap="xs">
        <Inline gap="sm" wrap>
          {detail.options.map(option => (
            <FilterChipButton
              key={option.id}
              style={styles.touchTarget}
              label={option.label}
              isActive={detail.selectedId === option.id}
              onPress={() => detail.onSelect(option.id)}
            />
          ))}
        </Inline>
        {detail.issue ? (
          <AppText variant="caption" color="error">
            {detail.issue}
          </AppText>
        ) : null}
      </Stack>
    );
  }
  return (
    <CardPaymentDetails
      detail={detail}
      currency={currency}
      itemId={itemId}
      locale={locale}
    />
  );
}

function CardPaymentDetails({
  detail,
  currency,
  itemId,
  locale,
}: {
  readonly detail: Extract<AccountCollectedItem['detail'], { kind: 'card' }>;
  readonly currency: string;
  readonly itemId: string;
  readonly locale: string;
}) {
  const { theme, tokens, fonts } = useTheme();
  const amountFallback = detail.paymentPlan.amount > 0 ? formatAmountInput(detail.paymentPlan.amount, locale) : '';
  const [localAmount, setLocalAmount] = useState<{ source: string; text: string }>();
  const amountText = detail.paymentAmountText ?? (localAmount?.source === amountFallback ? localAmount.text : amountFallback);
  const [amountTouched, setAmountTouched] = useState(false);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const parsedPayment = parseAmountInput(amountText, locale, currencyPrecision(currency));
  const paymentIssue =
    detail.paymentAmountError !== undefined
      ? detail.paymentAmountError ?? undefined
      : amountTouched && parsedPayment.status !== 'empty'
        ? amountIssueMessage(parsedPayment, false, false)
        : undefined;

  return (
    <Inline align="center" justify="space-between" gap="sm" wrap>
      <Stack gap="xs">
        <Inline align="center" gap="xs">
          <AppText variant="caption" color="secondary">
            {copy.cardPay}
          </AppText>
          <AppText variant="caption" color="secondary">
            {symbol}
          </AppText>
          <TextInput
            value={amountText}
            onChangeText={text => {
              if (!detail.onPaymentAmountTextChange) setLocalAmount({ source: amountFallback, text });
              setAmountTouched(true);
              detail.onPaymentAmountTextChange?.(text);
              const parsed = parseAmountInput(text, locale, currencyPrecision(currency));
              if (parsed.status === 'valid' && !amountIssueMessage(parsed, false, false)) {
                detail.onAmountChange(parsed.value > 0 ? parsed.value : undefined);
              } else if (parsed.status === 'empty') {
                detail.onAmountChange(undefined);
              }
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={tokens.input.placeholder}
            accessibilityLabel={copy.cardPaymentAmount}
            accessibilityHint={paymentIssue}
            testID={`onboarding-card-pay-${itemId}`}
            style={[
              styles.rowInput,
              styles.amountInput,
              styles.payInput,
              {
                color: theme.text,
                fontFamily: (fonts.numeric ?? fonts).semibold,
                fontVariant: ['tabular-nums', 'lining-nums'],
              },
            ]}
          />
        </Inline>
        <AppText variant="caption" color="secondary">{copy.cardPaymentOptional}</AppText>
        {paymentIssue ? (
          <AppText variant="caption" color="error">
            {paymentIssue}
          </AppText>
        ) : null}
      </Stack>
      <CollectedDateField
        date={detail.paymentPlan.date}
        dateLabel={detail.paymentPlan.dateLabel}
        locale={locale}
        onChange={detail.onDateChange}
      />
    </Inline>
  );
}

function IncomeDetails({ item }: { readonly item: IncomeCollectedItem }) {
  const [pickingInterval, setPickingInterval] = useState(false);
  const selectedIntervalLabel =
    item.cadence.intervals.find(interval => interval.id === item.cadence.selectedInterval)?.label ??
    copy.monthly;

  return (
    <Inline align="center" justify="space-between" gap="sm">
      <PressScaleTouchable
        haptic="selection"
        onPress={() => setPickingInterval(true)}
        accessibilityRole="button"
        accessibilityLabel={`${copy.salaryOften} ${selectedIntervalLabel}`}
        testID={`onboarding-interval-${item.id}`}
        style={styles.cadenceTrigger}
      >
        <Inline align="center" gap="xs">
          <AppText variant="caption" weight="medium">
            {selectedIntervalLabel}
          </AppText>
          <AppIcon name={Icon.ChevronDown} size={Size.iconXs} color="textSecondary" />
        </Inline>
      </PressScaleTouchable>
      <CollectedDateField
        date={item.cadence.date}
        dateLabel={item.cadence.dateLabel}
        locale={item.locale}
        onChange={item.onDateChange}
      />
      <SelectionPickerSheet
        visible={pickingInterval}
        title={copy.salaryOften}
        options={item.cadence.intervals.map(interval => ({
          id: interval.id,
          label: interval.label,
        }))}
        selectedValue={item.cadence.selectedInterval}
        onClose={() => setPickingInterval(false)}
        onSelect={item.onIntervalChange}
      />
    </Inline>
  );
}

function PaymentDetails({ item }: { readonly item: PaymentCollectedItem }) {
  return (
    <Inline align="center" justify="space-between" gap="sm">
      <Box />
      <CollectedDateField
        date={item.date}
        dateLabel={item.dateLabel}
        locale={item.locale}
        onChange={item.onDateChange}
      />
    </Inline>
  );
}

function CollectedDateField({
  date,
  dateLabel,
  locale,
  onChange,
}: {
  readonly date: number;
  readonly dateLabel: string;
  readonly locale?: string;
  readonly onChange: (date: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const dateLocale = locale ?? getLocales()[0]?.languageTag ?? 'en-US';
  return (
    <>
      <FilterChipButton
        style={styles.touchTarget}
        icon={Icon.Calendar}
        label={`${dateLabel} ${new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short' }).format(dayjs(date).toDate())}`}
        onPress={() => setVisible(true)}
      />
      <DateTimePickerModal
        visible={visible}
        date={dayjs(date).format('YYYY-MM-DD')}
        time="09:00"
        onClose={() => setVisible(false)}
        onSelect={next => {
          onChange(dayjs(next).startOf('day').valueOf());
          setVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rowInput: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    paddingVertical: 0,
    fontSize: Typography.sizes.base,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
  },
  amountHit: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '55%',
  },
  amountInput: {
    minWidth: 72,
    maxWidth: 180,
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    textAlign: 'right',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  payInput: {
    width: Size.fieldNarrow,
    fontSize: Typography.sizes.sm,
    textAlign: 'left',
  },
  cadenceTrigger: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
  },
  removeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  touchTarget: {
    minHeight: Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
  },
});
