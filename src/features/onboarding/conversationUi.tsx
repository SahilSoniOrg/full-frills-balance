import {
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  FilterChipButton,
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
import { type ReactNode, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import { parseAmount } from './draft';

export interface ConversationOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
}

export function ConversationStep({
  title,
  subtitle,
  children,
  primaryLabel = copy.continue,
  primaryTestID = 'onboarding-continue-button',
  onPrimary,
  primaryDisabled,
  primaryLoading,
  skipLabel,
  onSkip,
  onBack,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
  readonly primaryLabel?: string;
  readonly primaryTestID?: string;
  readonly onPrimary?: () => void;
  readonly primaryDisabled?: boolean;
  readonly primaryLoading?: boolean;
  readonly skipLabel?: string;
  readonly onSkip?: () => void;
  readonly onBack: () => void;
}) {
  const [footerHeight, setFooterHeight] = useState(0);

  return (
    <Box flex={1}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, { paddingBottom: footerHeight + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <Stack gap="lg" paddingTop={title ? 'xl' : 'sm'}>
          {title ? (
            <Stack gap="sm" align="center">
              <AppText
                variant="title"
                align="center"
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={styles.title}
              >
                {title}
              </AppText>
              {subtitle ? (
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                  {subtitle}
                </AppText>
              ) : null}
            </Stack>
          ) : null}
          {children}
        </Stack>
      </ScrollView>
      <Box
        background="background"
        borderTopWidth={1}
        borderColor="border"
        paddingTop="md"
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          setFooterHeight(previousHeight => (previousHeight === height ? previousHeight : height));
        }}
      >
        <Stack space="xs">
          {onSkip ? (
            <AppButton variant="ghost" size="md" onPress={onSkip} testID="onboarding-skip">
              {skipLabel ?? copy.addLater}
            </AppButton>
          ) : null}
          {onPrimary ? (
            <AppButton
              variant="primary"
              size="lg"
              onPress={() => {
                Keyboard.dismiss();
                onPrimary();
              }}
              disabled={primaryDisabled || primaryLoading}
              loading={primaryLoading}
              testID={primaryTestID}
              style={{ width: '100%' }}
            >
              {primaryLabel}
            </AppButton>
          ) : null}
          <AppButton variant="ghost" size="md" onPress={onBack}>
            {copy.back}
          </AppButton>
        </Stack>
      </Box>
    </Box>
  );
}

/** Type chips scroll horizontally inside the vertical collector scroll. */
export function ChoiceChips({
  options,
  selectedId,
  onSelect,
}: {
  readonly options: readonly ConversationOption[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  const { theme } = useTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const canScrollRight =
    contentWidth > viewportWidth + 1 && offsetX < contentWidth - viewportWidth - 1;

  return (
    <Box
      style={styles.chipScroller}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        testID="onboarding-choice-chips"
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        onContentSizeChange={width => setContentWidth(width)}
        onScroll={event => setOffsetX(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {options.map(option => (
          <FilterChipButton
            key={option.id}
            label={option.label}
            icon={option.icon}
            isActive={selectedId === option.id}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </ScrollView>
      {canScrollRight ? (
        <Box pointerEvents="none" background="background" style={styles.chipCue}>
          <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={theme.textSecondary} />
        </Box>
      ) : null}
    </Box>
  );
}

export type CadenceId = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';

export type CollectedCadence = {
  readonly intervals?: readonly { id: CadenceId; label: string }[];
  readonly selectedInterval?: CadenceId;
  readonly date: number;
  readonly dateLabel: string;
};

export type CollectedChoice = {
  readonly options: readonly { id: string; label: string }[];
  readonly selectedId?: string;
};

export type CollectedPaymentPlan = {
  readonly amount: number;
  readonly date: number;
  readonly dateLabel: string;
};

export type CollectedItem = {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  readonly icon?: IconName;
  readonly cadence?: CollectedCadence;
  readonly choice?: CollectedChoice;
  readonly paymentPlan?: CollectedPaymentPlan;
};

export function CollectedList({
  items,
  currency,
  onRename,
  onAmountChange,
  onRemove,
  onIntervalChange,
  onDateChange,
  onChoiceChange,
  onPaymentAmountChange,
  onPaymentDateChange,
}: {
  readonly items: readonly CollectedItem[];
  readonly currency: string;
  readonly onRename: (id: string, title: string) => void;
  readonly onAmountChange: (id: string, amount: number) => void;
  readonly onRemove: (id: string) => void;
  readonly onIntervalChange?: (id: string, interval: CadenceId) => void;
  readonly onDateChange?: (id: string, date: number) => void;
  readonly onChoiceChange?: (id: string, choiceId: string) => void;
  readonly onPaymentAmountChange?: (id: string, amount: number) => void;
  readonly onPaymentDateChange?: (id: string, date: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Stack gap="sm">
      {items.map(item => (
        <Animated.View
          key={item.id}
          layout={LinearTransition.duration(320).easing(Easing.out(Easing.cubic))}
        >
          <CollectedRow
            item={item}
            currency={currency}
            onRename={onRename}
            onAmountChange={onAmountChange}
            onRemove={onRemove}
            onIntervalChange={onIntervalChange}
            onDateChange={onDateChange}
            onChoiceChange={onChoiceChange}
            onPaymentAmountChange={onPaymentAmountChange}
            onPaymentDateChange={onPaymentDateChange}
          />
        </Animated.View>
      ))}
      <AppText variant="caption" color="secondary" style={styles.swipeHint}>
        {copy.swipeToRemove}
      </AppText>
    </Stack>
  );
}

function CollectedRow({
  item,
  currency,
  onRename,
  onAmountChange,
  onRemove,
  onIntervalChange,
  onDateChange,
  onChoiceChange,
  onPaymentAmountChange,
  onPaymentDateChange,
}: {
  readonly item: CollectedItem;
  readonly currency: string;
  readonly onRename: (id: string, title: string) => void;
  readonly onAmountChange: (id: string, amount: number) => void;
  readonly onRemove: (id: string) => void;
  readonly onIntervalChange?: (id: string, interval: CadenceId) => void;
  readonly onDateChange?: (id: string, date: number) => void;
  readonly onChoiceChange?: (id: string, choiceId: string) => void;
  readonly onPaymentAmountChange?: (id: string, amount: number) => void;
  readonly onPaymentDateChange?: (id: string, date: number) => void;
}) {
  const { theme, tokens } = useTheme();
  const [name, setName] = useState(item.title);
  const [amountText, setAmountText] = useState(item.amount === 0 ? '' : String(item.amount));
  const [payText, setPayText] = useState(
    item.paymentPlan && item.paymentPlan.amount > 0 ? String(item.paymentPlan.amount) : '',
  );
  const [editingName, setEditingName] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [pickingPayDate, setPickingPayDate] = useState(false);
  const [pickingInterval, setPickingInterval] = useState(false);
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const amountMeasure = amountText.length > 0 ? amountText : '0';
  const payMeasure = payText.length > 0 ? payText : '0';
  const cadence = item.cadence;
  const selectedIntervalLabel =
    cadence?.intervals?.find(interval => interval.id === cadence.selectedInterval)?.label ??
    copy.monthly;
  const shownName = editingName ? name : item.title;

  return (
    <SwipeToRemove label={copy.removeItem} onRemove={() => onRemove(item.id)}>
      <AppCard
        variant="outline"
        background="surface"
        paddingSize="none"
        accessibilityActions={[{ name: 'delete', label: copy.removeItem }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'delete') onRemove(item.id);
        }}
      >
        <Box paddingHorizontal="xl" paddingVertical="sm">
          <Stack gap="xs">
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
                  onRename(item.id, name);
                }}
                accessibilityLabel={item.title}
                testID={`onboarding-name-${item.id}`}
                style={[styles.rowInput, styles.nameInput, { color: theme.text }]}
              />
              <Box style={styles.amountHit}>
                <Inline align="center" gap="xs">
                  <AppText variant="body" color="secondary">
                    {symbol}
                  </AppText>
                  <Box style={styles.amountWrap}>
                    <Text style={styles.amountGhost}>{amountMeasure}</Text>
                    <TextInput
                      value={amountText}
                      onChangeText={text => {
                        setAmountText(text);
                        onAmountChange(item.id, parseAmount(text) ?? 0);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={tokens.input.placeholder}
                      accessibilityLabel={copy.currentBalance}
                      testID={`onboarding-amount-${item.id}`}
                      style={[styles.rowInput, styles.amountInput, { color: theme.text }]}
                    />
                  </Box>
                </Inline>
              </Box>
            </Inline>
            {item.choice && onChoiceChange ? (
              <Inline gap="sm" wrap>
                {item.choice.options.map(option => (
                  <FilterChipButton
                    key={option.id}
                    label={option.label}
                    isActive={item.choice?.selectedId === option.id}
                    onPress={() => onChoiceChange(item.id, option.id)}
                  />
                ))}
              </Inline>
            ) : null}
            {item.paymentPlan && onPaymentAmountChange ? (
              <Inline align="center" justify="space-between" gap="sm">
                <Inline align="center" gap="xs">
                  <AppText variant="caption" color="secondary">
                    {copy.cardPay}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {symbol}
                  </AppText>
                  <Box style={styles.amountWrap}>
                    <Text style={[styles.amountGhost, styles.payGhost]}>{payMeasure}</Text>
                    <TextInput
                      value={payText}
                      onChangeText={text => {
                        setPayText(text);
                        onPaymentAmountChange(item.id, parseAmount(text) ?? 0);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={tokens.input.placeholder}
                      accessibilityLabel={copy.cardPaymentAmount}
                      testID={`onboarding-card-pay-${item.id}`}
                      style={[
                        styles.rowInput,
                        styles.amountInput,
                        styles.payInput,
                        { color: theme.text },
                      ]}
                    />
                  </Box>
                </Inline>
                {onPaymentDateChange ? (
                  <FilterChipButton
                    icon={Icon.Calendar}
                    label={`${item.paymentPlan.dateLabel} ${dayjs(item.paymentPlan.date).format('D MMM')}`}
                    onPress={() => setPickingPayDate(true)}
                  />
                ) : null}
              </Inline>
            ) : null}
            {cadence ? (
              <Inline align="center" justify="space-between" gap="sm">
                {cadence.intervals && onIntervalChange ? (
                  <TouchableOpacity
                    onPress={() => setPickingInterval(true)}
                    accessibilityRole="button"
                    accessibilityLabel={copy.salaryOften}
                    testID={`onboarding-interval-${item.id}`}
                    style={styles.cadenceTrigger}
                  >
                    <Inline align="center" gap="xs">
                      <AppText variant="caption" weight="medium">
                        {selectedIntervalLabel}
                      </AppText>
                      <AppIcon name={Icon.ChevronDown} size={Size.iconXs} color="textSecondary" />
                    </Inline>
                  </TouchableOpacity>
                ) : (
                  <Box />
                )}
                {onDateChange ? (
                  <FilterChipButton
                    icon={Icon.Calendar}
                    label={`${cadence.dateLabel} ${dayjs(cadence.date).format('D MMM')}`}
                    onPress={() => setPickingDate(true)}
                  />
                ) : null}
              </Inline>
            ) : null}
          </Stack>
        </Box>
        {cadence?.intervals && onIntervalChange ? (
          <SelectionPickerSheet
            visible={pickingInterval}
            title={copy.salaryOften}
            options={cadence.intervals.map(interval => ({
              id: interval.id,
              label: interval.label,
            }))}
            selectedValue={cadence.selectedInterval ?? 'MONTHLY'}
            onClose={() => setPickingInterval(false)}
            onSelect={value => onIntervalChange(item.id, value)}
          />
        ) : null}
        {cadence && onDateChange ? (
          <DateTimePickerModal
            visible={pickingDate}
            date={dayjs(cadence.date).format('YYYY-MM-DD')}
            time="09:00"
            onClose={() => setPickingDate(false)}
            onSelect={next => {
              onDateChange(item.id, dayjs(next).startOf('day').valueOf());
              setPickingDate(false);
            }}
          />
        ) : null}
        {item.paymentPlan && onPaymentDateChange ? (
          <DateTimePickerModal
            visible={pickingPayDate}
            date={dayjs(item.paymentPlan.date).format('YYYY-MM-DD')}
            time="09:00"
            onClose={() => setPickingPayDate(false)}
            onSelect={next => {
              onPaymentDateChange(item.id, dayjs(next).startOf('day').valueOf());
              setPickingPayDate(false);
            }}
          />
        ) : null}
      </AppCard>
    </SwipeToRemove>
  );
}

export function CollectStep({
  title,
  subtitle,
  continueLabel,
  onContinue,
  continueDisabled,
  skipLabel,
  onSkip,
  onBack,
  chipLabel,
  chips,
  onAddChip,
  currency,
  items,
  onRename,
  onAmountChange,
  onRemove,
  onIntervalChange,
  onDateChange,
  onChoiceChange,
  onPaymentAmountChange,
  onPaymentDateChange,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly continueLabel?: string;
  readonly onContinue: () => void;
  readonly continueDisabled?: boolean;
  readonly skipLabel?: string;
  readonly onSkip?: () => void;
  readonly onBack: () => void;
  readonly chipLabel: string;
  readonly chips: readonly ConversationOption[];
  readonly onAddChip: (id: string) => void;
  readonly currency: string;
  readonly items: readonly CollectedItem[];
  readonly onRename: (id: string, title: string) => void;
  readonly onAmountChange: (id: string, amount: number) => void;
  readonly onRemove: (id: string) => void;
  readonly onIntervalChange?: (id: string, interval: CadenceId) => void;
  readonly onDateChange?: (id: string, date: number) => void;
  readonly onChoiceChange?: (id: string, choiceId: string) => void;
  readonly onPaymentAmountChange?: (id: string, amount: number) => void;
  readonly onPaymentDateChange?: (id: string, date: number) => void;
}) {
  return (
    <ConversationStep
      title={title}
      subtitle={subtitle}
      primaryLabel={continueLabel}
      primaryDisabled={continueDisabled}
      onPrimary={onContinue}
      skipLabel={skipLabel}
      onSkip={onSkip}
      onBack={onBack}
    >
      <Stack gap="md">
        <AppText variant="caption" color="secondary">
          {chipLabel}
        </AppText>
        <ChoiceChips options={chips} onSelect={onAddChip} />
        <CollectedList
          items={items}
          currency={currency}
          onRename={onRename}
          onAmountChange={onAmountChange}
          onRemove={onRemove}
          onIntervalChange={onIntervalChange}
          onDateChange={onDateChange}
          onChoiceChange={onChoiceChange}
          onPaymentAmountChange={onPaymentAmountChange}
          onPaymentDateChange={onPaymentDateChange}
        />
      </Stack>
    </ConversationStep>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  chipScroller: {
    position: 'relative',
  },
  chipCue: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.xl,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  title: {
    width: '100%',
    lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
  },
  subtitle: {
    textAlign: 'center',
    width: '100%',
  },
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
    minWidth: 64,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  amountWrap: {
    justifyContent: 'center',
    minWidth: 32,
  },
  amountGhost: {
    fontSize: Typography.sizes.base,
    minHeight: 28,
    paddingVertical: 0,
    textAlign: 'right',
    opacity: 0,
  },
  amountInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    textAlign: 'right',
  },
  payGhost: {
    fontSize: Typography.sizes.sm,
    minHeight: 24,
  },
  payInput: {
    fontSize: Typography.sizes.sm,
    textAlign: 'left',
  },
  swipeHint: {
    textAlign: 'center',
  },
  cadenceTrigger: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
  },
});
