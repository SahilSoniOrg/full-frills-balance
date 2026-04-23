import { DateView } from '@/src/components/common/CustomDateTimePicker/DateView';
import { TimeView } from '@/src/components/common/CustomDateTimePicker/TimeView';
import { AppButton, AppSegmentedControl, AppText, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DateTimePickerModalProps {
  visible: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  onClose: () => void;
  onSelect: (date: string, time: string, weekday?: number) => void;
  hideDate?: boolean;
  showWeekdayPicker?: boolean;
  weekday?: number;
}

/**
 * DateTimePickerModal - A unified picker for date and time using react-native-ui-datepicker.
 */
export function DateTimePickerModal({
  visible,
  date,
  time,
  onClose,
  onSelect,
  hideDate = false,
  showWeekdayPicker = false,
  weekday = 1,
}: DateTimePickerModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedValue, setSelectedValue] = useState(() => dayjs(`${date}T${time}`));
  const [selectedWeekday, setSelectedWeekday] = useState(weekday);

  const days = [
    { id: 1, label: 'S' },
    { id: 2, label: 'M' },
    { id: 3, label: 'T' },
    { id: 4, label: 'W' },
    { id: 5, label: 'T' },
    { id: 6, label: 'F' },
    { id: 7, label: 'S' },
  ] as const;

  useEffect(() => {
    if (!visible) return;
    const nextValue = dayjs(`${date}T${time}`);
    setSelectedValue(nextValue.isValid() ? nextValue : dayjs());
    setSelectedWeekday(weekday);
  }, [visible, date, time, weekday]);

  const handleApply = () => {
    const newDate = selectedValue.format('YYYY-MM-DD');
    const newTime = selectedValue.format('HH:mm');
    onSelect(newDate, newTime, selectedWeekday);
    onClose();
  };

  const handleDateChange = (newDate: dayjs.Dayjs) => {
    setSelectedValue(newDate);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
          onPress={e => e.stopPropagation()}
        >
          <View style={styles.header}>
            <IconButton name="close" onPress={onClose} />
            <View style={styles.headerTitle}>
              <AppText variant="subheading" weight="bold">
                {hideDate ? 'Select Time' : 'Date & Time'}
              </AppText>
              <AppText variant="caption" color="secondary">
                {selectedValue.format('DD MMM YYYY, HH:mm')}
              </AppText>
            </View>
            <View style={{ width: Size.md + Spacing.md }} />
          </View>

          <View style={styles.pickerContainer}>
            {!hideDate && <DateView date={selectedValue} onChange={handleDateChange} />}
            <View style={!hideDate ? { marginTop: Spacing.md } : null}>
              <TimeView date={selectedValue} onChange={handleDateChange} />
            </View>
          </View>

          {showWeekdayPicker && (
            <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.md }}>
              <AppText
                variant="caption"
                weight="semibold"
                color="secondary"
                style={{ marginBottom: Spacing.xs, marginLeft: Spacing.xs }}
              >
                Select Day of Week
              </AppText>
              <AppSegmentedControl
                options={days.map(d => ({ id: d.id.toString(), label: d.label }))}
                value={selectedWeekday.toString()}
                onChange={(id: string) => setSelectedWeekday(parseInt(id, 10))}
                minWidth={44}
                flex={true}
              />
            </View>
          )}

          <Separator style={styles.divider} />

          <View style={{ paddingHorizontal: Spacing.lg }}>
            <AppButton variant="primary" onPress={handleApply}>
              {hideDate ? 'Set Time' : 'Set Date & Time'}
            </AppButton>
          </View>
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
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    alignItems: 'center',
    gap: 2,
  },
  tabsContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  pickerContainer: {
    paddingHorizontal: Spacing.md,
  },
  divider: {
    marginVertical: Spacing.md,
  },
});
