import { AppButton, AppText, IconButton } from '@/src/components/core';
import { Layout, Opacity, Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PeriodFilter } from '@/src/utils/dateUtils';
import type { Dayjs } from 'dayjs';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { DateRangeCalendarStep } from './DateRangeCalendarStep';
import { DateRangeMenuContent } from './DateRangeMenuContent';

export type PickerView = 'MENU' | 'START_DATE' | 'END_DATE';

export interface DateRangePickerViewProps {
  visible: boolean;
  onClose: () => void;
  insets: EdgeInsets;
  view: PickerView;
  setView: (view: PickerView) => void;
  draftFilter: PeriodFilter;
  customRange: { startDate: Dayjs | null; endDate: Dayjs | null };
  lastNValue: string;
  lastNUnit: 'days' | 'weeks' | 'months';
  monthList: { month: number; year: number; label: string }[];
  handleSelectMonth: (month: number, year: number) => void;
  handleSelectCustom: () => void;
  handleSelectAllTime: () => void;
  updateLastN: (value: string, unit: 'days' | 'weeks' | 'months') => void;
  handleDateSelect: (date: Dayjs) => void;
  handleApply: () => void;
}

export function DateRangePickerView({
  visible,
  onClose,
  insets,
  view,
  setView,
  draftFilter,
  customRange,
  lastNValue,
  lastNUnit,
  monthList,
  handleSelectMonth,
  handleSelectCustom,
  handleSelectAllTime,
  updateLastN,
  handleDateSelect,
  handleApply,
}: DateRangePickerViewProps) {
  const { theme, fonts } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (view !== 'MENU') setView('MENU');
        else onClose();
      }}
    >
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + Spacing.md,
              borderTopColor: withOpacity(theme.border, Opacity.medium),
            },
          ]}
          onPress={event => event.stopPropagation()}
        >
          {view === 'MENU' ? (
            <>
              <View style={styles.dragHandleContainer}>
                <View
                  style={[
                    styles.dragHandle,
                    { backgroundColor: withOpacity(theme.textSecondary, Opacity.muted) },
                  ]}
                />
              </View>

              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <AppText variant="heading" style={{ fontFamily: fonts.bold }}>
                    Choose Range
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.headerSubtitle}>
                    Pick a month, custom dates, or a rolling window.
                  </AppText>
                </View>
                <IconButton
                  name="close"
                  onPress={onClose}
                  variant="surface"
                  iconColor={theme.textSecondary}
                />
              </View>
            </>
          ) : null}

          <View style={{ flex: 1 }}>
            {view === 'MENU' ? (
              <DateRangeMenuContent
                draftFilter={draftFilter}
                customRange={customRange}
                lastNValue={lastNValue}
                lastNUnit={lastNUnit}
                monthList={monthList}
                onSelectMonth={handleSelectMonth}
                onSelectCustom={handleSelectCustom}
                onSelectAllTime={handleSelectAllTime}
                onShowStartDate={() => setView('START_DATE')}
                onShowEndDate={() => setView('END_DATE')}
                onUpdateLastN={updateLastN}
              />
            ) : (
              <DateRangeCalendarStep
                mode={view}
                date={view === 'START_DATE' ? customRange.startDate : customRange.endDate}
                onBack={() => setView('MENU')}
                onSelect={handleDateSelect}
              />
            )}
          </View>

          {view === 'MENU' ? (
            <View
              style={[styles.footer, { borderTopColor: withOpacity(theme.border, Opacity.heavy) }]}
            >
              <AppButton onPress={handleApply} variant="primary" size="lg">
                Apply Range
              </AppButton>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    borderTopWidth: 1,
    height: Layout.modal.defaultHeight,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingBottom: Spacing.md,
  },
  dragHandle: {
    width: Layout.modal.dragHandle.width + 16,
    height: Layout.modal.dragHandle.height,
    borderRadius: Layout.modal.dragHandle.borderRadius,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerCopy: {
    flex: 1,
    paddingTop: Spacing.xs,
  },
  headerSubtitle: {
    marginTop: Spacing.xs,
    lineHeight: Typography.sizes.sm * 1.5,
  },
  footer: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
});
