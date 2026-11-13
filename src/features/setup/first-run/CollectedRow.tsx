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
import dayjs from 'dayjs';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { parseAmount } from './draft';

export type CadenceId = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';

type CollectedItemBase = {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  readonly amountLabel: string;
  readonly icon?: IconName;
  readonly onRename: (title: string) => void;
  readonly onAmountChange: (amount: number) => void;
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
        readonly onSelect: (choiceId: string) => void;
      }
    | {
        readonly kind: 'card';
        readonly paymentPlan: { amount: number; date: number; dateLabel: string };
        readonly onAmountChange: (amount: number) => void;
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
}: {
  readonly item: CollectedItem;
  readonly currency: string;
}) {
  const { theme, tokens, fonts } = useTheme();
  const [name, setName] = useState(item.title);
  const [amountText, setAmountText] = useState(item.amount === 0 ? '' : String(item.amount));
  const [editingName, setEditingName] = useState(false);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const shownName = editingName ? name : item.title;

  return (
    <SwipeToRemove label={copy.removeItem} onRemove={item.onRemove}>
      <AppCard
        variant="outline"
        background="surface"
        paddingSize="none"
        accessibilityActions={[{ name: 'delete', label: copy.removeItem }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'delete') item.onRemove();
        }}
      >
        <Box paddingHorizontal="xl" paddingVertical="sm">
          <Stack gap="xs">
            <Inline align="center" gap="sm">
              <Stack flex={1} gap="xs">
                <Inline align="center" gap="sm">
                  {item.icon ? (
                    <AppIcon name={item.icon} size={Size.iconXs} color="textSecondary" />
                  ) : null}
                  <TextInput
                    value={shownName}
                    onChangeText={setName}
                    onFocus={() => {
                      setName(item.title);
                      setEditingName(true);
                    }}
                    onBlur={() => {
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
                <Inline align="center" gap="xs">
                  <AppText variant="body" color="secondary">
                    {symbol}
                  </AppText>
                  <TextInput
                    value={amountText}
                    onChangeText={text => {
                      setAmountText(text);
                      item.onAmountChange(parseAmount(text) ?? 0);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={tokens.input.placeholder}
                    accessibilityLabel={`${item.title}, ${item.amountLabel}`}
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
              </Box>
            </Inline>
            {item.kind === 'account' ? (
              <AccountDetails detail={item.detail} currency={currency} itemId={item.id} />
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
}: {
  readonly detail: AccountCollectedItem['detail'];
  readonly currency: string;
  readonly itemId: string;
}) {
  if (detail.kind === 'plain') return null;
  if (detail.kind === 'savings') {
    return (
      <Inline gap="sm" wrap>
        {detail.options.map(option => (
          <FilterChipButton
            key={option.id}
            label={option.label}
            isActive={detail.selectedId === option.id}
            onPress={() => detail.onSelect(option.id)}
          />
        ))}
      </Inline>
    );
  }
  return <CardPaymentDetails detail={detail} currency={currency} itemId={itemId} />;
}

function CardPaymentDetails({
  detail,
  currency,
  itemId,
}: {
  readonly detail: Extract<AccountCollectedItem['detail'], { kind: 'card' }>;
  readonly currency: string;
  readonly itemId: string;
}) {
  const { theme, tokens, fonts } = useTheme();
  const [amountText, setAmountText] = useState(
    detail.paymentPlan.amount > 0 ? String(detail.paymentPlan.amount) : '',
  );
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;

  return (
    <Inline align="center" justify="space-between" gap="sm">
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
            setAmountText(text);
            detail.onAmountChange(parseAmount(text) ?? 0);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={tokens.input.placeholder}
          accessibilityLabel={copy.cardPaymentAmount}
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
      <CollectedDateField
        date={detail.paymentPlan.date}
        dateLabel={detail.paymentPlan.dateLabel}
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
        onChange={item.onDateChange}
      />
    </Inline>
  );
}

function CollectedDateField({
  date,
  dateLabel,
  onChange,
}: {
  readonly date: number;
  readonly dateLabel: string;
  readonly onChange: (date: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <FilterChipButton
        icon={Icon.Calendar}
        label={`${dateLabel} ${dayjs(date).format('D MMM')}`}
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
    minHeight: 28,
    paddingVertical: 0,
    fontSize: Typography.sizes.base,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
  },
  amountHit: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amountInput: {
    width: Size.fieldAmount,
    minWidth: 48,
    flexShrink: 0,
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
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
  },
});
