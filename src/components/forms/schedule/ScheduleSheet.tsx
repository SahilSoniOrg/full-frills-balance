import { AppButton, AppInputField, AppText, Icon, AppIcon } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { IvyPalette, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import type { RecurrenceInterval } from '@/src/services/forward-finance/recurrence/types';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { formatScheduleSentence, previewOccurrences } from './formatSchedule';
import type { ScheduleValue } from './types';

export interface ScheduleSheetProps {
  visible: boolean;
  value: ScheduleValue;
  startDate: number;
  onDone: (value: ScheduleValue) => void;
  onClose: () => void;
  intervalTestIDPrefix?: string;
}

const tabs: { id: RecurrenceInterval; label: string }[] = [
  { id: 'DAILY', label: copy.day },
  { id: 'WEEKLY', label: copy.week },
  { id: 'MONTHLY', label: copy.month },
  { id: 'YEARLY', label: copy.year },
];
const months = copy.monthShortNames;
const weekdays = copy.weekdayShortNames;
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const anchorTimestamp = (startDate: number) =>
  RecurrenceEngine.computeFirstOccurrence(startDate, { intervalType: 'DAILY', intervalN: 1 });
const anchorPart = (startDate: number, part: 'day' | 'month'): string => {
  const timestamp = anchorTimestamp(startDate);
  const options: Intl.DateTimeFormatOptions =
    part === 'day' ? { day: 'numeric' } : { month: 'numeric' };
  const formatted = new Intl.DateTimeFormat('en-US', options).format(timestamp);
  return formatted;
};
const anchorWeekday = (startDate: number) =>
  Math.max(
    0,
    (copy.weekdayNames as readonly string[]).indexOf(
      new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(anchorTimestamp(startDate)),
    ),
  );
const anchorDay = (startDate: number) => Number(anchorPart(startDate, 'day'));
const anchorMonth = (startDate: number) => Number(anchorPart(startDate, 'month'));
const sameSchedule = (left: ScheduleValue, right: ScheduleValue) =>
  left.intervalType === right.intervalType &&
  left.intervalN === right.intervalN &&
  left.recurrenceDay === right.recurrenceDay &&
  left.recurrenceMonth === right.recurrenceMonth;

export function ScheduleSheet({
  visible,
  value,
  startDate,
  onDone,
  onClose,
  intervalTestIDPrefix,
}: ScheduleSheetProps) {
  const [draft, setDraft] = useState(value);
  const [previousProps, setPreviousProps] = useState({ visible, value });
  if (visible && (!previousProps.visible || !sameSchedule(previousProps.value, value))) {
    setPreviousProps({ visible, value });
    setDraft(value);
  } else if (previousProps.visible !== visible) {
    setPreviousProps({ visible, value });
  }
  const { theme, themeMode } = useTheme();
  const accent = themeMode === 'light' ? IvyPalette.greenDark : theme.primary;
  const update = (patch: Partial<ScheduleValue>) => setDraft(current => ({ ...current, ...patch }));
  const updateInterval = (intervalType: RecurrenceInterval) =>
    setDraft(current => {
      if (intervalType === current.intervalType) return current;
      if (intervalType === 'DAILY')
        return { ...current, intervalType, recurrenceDay: undefined, recurrenceMonth: undefined };
      if (intervalType === 'WEEKLY')
        return {
          ...current,
          intervalType,
          recurrenceDay: anchorWeekday(startDate),
          recurrenceMonth: undefined,
        };
      if (intervalType === 'MONTHLY')
        return {
          ...current,
          intervalType,
          recurrenceDay: anchorDay(startDate),
          recurrenceMonth: undefined,
        };
      return {
        ...current,
        intervalType,
        recurrenceDay: anchorDay(startDate),
        recurrenceMonth: anchorMonth(startDate),
      };
    });
  const valid = isValidRepeatCount(draft.intervalN);
  const dates = previewOccurrences(draft, startDate);
  const sentenceParts = formatScheduleSentence(draft);
  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    id?: string,
    wide = false,
  ) => (
    <Pressable
      key={id ?? label}
      testID={id}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minWidth: wide ? '100%' : undefined,
        flex: wide ? undefined : 1,
        height: Size.touchTarget,
        margin: 2,
        borderRadius: Size.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? theme.primary : 'transparent',
        borderWidth: selected ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      <AppText
        variant="bodySmall"
        weight={selected ? 'semibold' : 'regular'}
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
  return (
    <ModalSurface
      visible={visible}
      title={copy.scheduleSheetTitle}
      accessibilityCloseLabel={copy.closeDialog}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={90}
      scrollable
      footer={
        <View style={{ paddingTop: Spacing.md }}>
          <AppButton
            onPress={() => valid && onDone(draft)}
            disabled={!valid}
            accessibilityLabel={copy.doneAccessibility}
          >
            {copy.done}
          </AppButton>
        </View>
      }
    >
      <View>
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            marginBottom: Spacing.md,
          }}
        >
          {tabs.map(tab => (
            <Pressable
              key={tab.id}
              testID={`${intervalTestIDPrefix ?? 'schedule-interval-type-item-'}${tab.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: draft.intervalType === tab.id }}
              onPress={() => updateInterval(tab.id)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: Spacing.sm,
                borderBottomWidth: draft.intervalType === tab.id ? 2 : 0,
                borderBottomColor: theme.primary,
              }}
            >
              <AppText
                variant="bodySmall"
                style={{ color: draft.intervalType === tab.id ? accent : theme.textSecondary }}
              >
                {tab.label}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: Spacing.md,
          }}
        >
          <AppText variant="body">{copy.every}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.decreaseRepeatCount}
              onPress={() =>
                update({
                  intervalN: Number.isFinite(draft.intervalN)
                    ? Math.max(1, draft.intervalN - 1)
                    : 1,
                })
              }
            >
              <AppIcon name={Icon.MinusSquare} size={22} color={theme.textSecondary} />
            </Pressable>
            <AppInputField
              testID="schedule-repeat-count"
              accessibilityLabel={copy.editRepeatCount}
              keyboardType="number-pad"
              value={Number.isNaN(draft.intervalN) ? '' : String(draft.intervalN)}
              onChangeText={text => update({ intervalN: text.trim() ? Number(text) : Number.NaN })}
              width={56}
              inputStyle={{ textAlign: 'center', color: valid ? theme.text : theme.error }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.increaseRepeatCount}
              onPress={() =>
                update({ intervalN: Number.isFinite(draft.intervalN) ? draft.intervalN + 1 : 1 })
              }
            >
              <AppIcon name={Icon.Add} size={22} color={theme.textSecondary} />
            </Pressable>
            <AppText variant="bodySmall" color="secondary">
              {
                {
                  DAILY: copy.dayUnit,
                  WEEKLY: copy.weekUnit,
                  MONTHLY: copy.monthUnit,
                  YEARLY: copy.yearUnit,
                }[draft.intervalType]
              }
            </AppText>
          </View>
        </View>
        {!valid ? (
          <AppText variant="caption" color="error">
            {copy.repeatCountError}
          </AppText>
        ) : null}
        {draft.intervalType === 'WEEKLY' ? (
          <>
            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.xs }}>
              {copy.daysSection.toUpperCase()}
            </AppText>
            <View style={{ flexDirection: 'row' }}>
              {weekdays.map((day, index) =>
                chip(
                  day,
                  draft.recurrenceDay === index,
                  () => update({ recurrenceDay: index }),
                  `schedule-weekday-${index}`,
                ),
              )}
            </View>
            {draft.recurrenceDay !== undefined ? (
              <AppText variant="caption" color="secondary" align="center">
                {copy.weekdayNames[draft.recurrenceDay]}
              </AppText>
            ) : null}
          </>
        ) : null}
        {draft.intervalType === 'YEARLY' ? (
          <>
            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.xs }}>
              {copy.monthsSection.toUpperCase()}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {months.map((month, index) => (
                <View key={month} style={{ width: '16.66%' }}>
                  {chip(
                    month,
                    draft.recurrenceMonth === index + 1,
                    () => update({ recurrenceMonth: index + 1 }),
                    `schedule-month-${index + 1}`,
                  )}
                </View>
              ))}
            </View>
          </>
        ) : null}
        {draft.intervalType === 'MONTHLY' || draft.intervalType === 'YEARLY' ? (
          <>
            <AppText
              variant="caption"
              color="secondary"
              style={{ marginTop: Spacing.md, marginBottom: Spacing.xs }}
            >
              {copy.daysSection.toUpperCase()}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
                <View key={day} style={{ width: '14.285%' }}>
                  {chip(
                    String(day),
                    draft.recurrenceDay === day,
                    () => update({ recurrenceDay: day }),
                    `schedule-day-${day}`,
                  )}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {chip(
                copy.lastDay,
                draft.recurrenceDay === 31,
                () => update({ recurrenceDay: 31 }),
                'schedule-last-day',
                true,
              )}
            </View>
          </>
        ) : null}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.border,
            marginTop: Spacing.md,
            paddingTop: Spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {sentenceParts.map((part, index) => (
              <AppText
                key={index}
                variant="bodyLarge"
                weight={part.emphasized ? 'semibold' : 'regular'}
                style={{ color: part.emphasized ? accent : theme.text }}
              >
                {part.text}
              </AppText>
            ))}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.lg, paddingTop: Spacing.sm }}
          >
            {dates.map((date, index) => (
              <AppText key={`${date}-${index}`} variant="caption" color="secondary">
                {index === 0 ? copy.next : ''}
                {shortDate.format(date)}
              </AppText>
            ))}
          </ScrollView>
        </View>
      </View>
    </ModalSurface>
  );
}
