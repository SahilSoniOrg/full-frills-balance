import { Spacing } from '@/src/constants';
import dayjs from 'dayjs';
import { StyleSheet, View } from 'react-native';
import { DateView } from './DateView';
import { TimeView } from './TimeView';

interface CustomDateTimePickerProps {
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
  timePicker?: boolean;
  datePicker?: boolean;
}

export function CustomDateTimePicker({
  date,
  onChange,
  timePicker,
  datePicker = true,
}: CustomDateTimePickerProps) {
  return (
    <View style={styles.container}>
      {datePicker && <DateView date={date} onChange={onChange} />}
      {timePicker && (
        <View style={[styles.timePickerContainer, !datePicker && { marginTop: 0 }]}>
          <TimeView date={date} onChange={onChange} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  timePickerContainer: {
    marginTop: Spacing.lg,
  },
});
