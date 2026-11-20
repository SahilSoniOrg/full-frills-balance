import { DateView } from '@/src/components/filters/CustomDateTimePicker/DateView';
import { TimeView } from '@/src/components/filters/CustomDateTimePicker/TimeView';
import { AppSegmentedControl, AppText } from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { formatClockTime, formatDateKeepingPattern } from '@/src/utils/dateFormatting';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

interface DateTimePickerModalProps {
  visible: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  onClose: () => void;
  onSelect: (date: string, time: string, weekday?: number) => void;
  hideDate?: boolean;
  hideTime?: boolean;
  showWeekdayPicker?: boolean;
  weekday?: number;
}

const DAYS = [
  { id: 1, label: 'S' },
  { id: 2, label: 'M' },
  { id: 3, label: 'T' },
  { id: 4, label: 'W' },
  { id: 5, label: 'T' },
  { id: 6, label: 'F' },
  { id: 7, label: 'S' },
] as const;

export function DateTimePickerModal({
  visible,
  date,
  time,
  onClose,
  onSelect,
  hideDate = false,
  hideTime = false,
  showWeekdayPicker = false,
  weekday = 1,
}: DateTimePickerModalProps) {
  const { resolvedHourCycle } = useHourCyclePrefs();

  const [selectedValue, setSelectedValue] = useState(() => dayjs(`${date}T${time}`));
  const [selectedWeekday, setSelectedWeekday] = useState(weekday);

  useEffect(() => {
    if (!visible) return;
    const nextValue = dayjs(`${date}T${time}`);
    setTimeout(() => {
      setSelectedValue(nextValue.isValid() ? nextValue : dayjs());
      setSelectedWeekday(weekday);
    }, 0);
  }, [visible, date, time, weekday]);

  const handleApply = () => {
    const newDate = selectedValue.format('YYYY-MM-DD');
    const newTime = selectedValue.format('HH:mm');
    onSelect(newDate, newTime, selectedWeekday);
    onClose();
  };

  return (
    <ModalSurface
      visible={visible}
      title={hideDate ? 'Select Time' : hideTime ? 'Select Date' : 'Date & Time'}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      accessibilityCloseLabel={AppConfig.strings.common.close}
      footer={
        <ModalActions
          actions={[
            {
              label: hideDate ? 'Set Time' : hideTime ? 'Set Date' : 'Set Date & Time',
              onPress: handleApply,
            },
          ]}
        />
      }
    >
      <AppText variant="caption" color="secondary">
        {hideDate
          ? formatClockTime(selectedValue, resolvedHourCycle)
          : formatDateKeepingPattern(selectedValue, 'DD MMM YYYY', resolvedHourCycle)}
      </AppText>
      {!hideDate && <DateView date={selectedValue} onChange={setSelectedValue} />}
      {!hideTime && <TimeView date={selectedValue} onChange={setSelectedValue} />}
      {showWeekdayPicker && (
        <Stack gap="xs">
          <AppText variant="caption" weight="semibold" color="secondary">
            Select Day of Week
          </AppText>
          <AppSegmentedControl
            options={DAYS.map(d => ({ id: d.id.toString(), label: d.label }))}
            value={selectedWeekday.toString()}
            onChange={(id: string) => setSelectedWeekday(parseInt(id, 10))}
            minWidth={44}
            flex={true}
          />
        </Stack>
      )}
    </ModalSurface>
  );
}
