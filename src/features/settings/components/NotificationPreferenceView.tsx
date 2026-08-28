import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppIcon, AppSegmentedControl, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { NotificationCadence } from '@/src/services/notification/NotificationService';
import dayjs from 'dayjs';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatClockTime } from '@/src/utils/dateUtils';
import { useState } from 'react';
import { TouchableOpacity } from 'react-native';

interface NotificationPreferenceViewProps {
  cadence: NotificationCadence;
  hour: number;
  minute: number;
  weekday: number;
  onUpdateCadence: (cadence: NotificationCadence) => Promise<void>;
  onUpdateTime: (hour: number, minute: number, weekday?: number) => Promise<void>;
  onSendTest: () => void;
}

export const NotificationPreferenceView = ({
  cadence,
  hour,
  minute,
  weekday,
  onUpdateCadence,
  onUpdateTime,
  onSendTest,
}: NotificationPreferenceViewProps) => {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();

  const [showTimePicker, setShowTimePicker] = useState(false);

  const options = [
    { id: 'none', label: AppConfig.strings.settings.notifications.none },
    { id: 'daily', label: AppConfig.strings.settings.notifications.daily },
    { id: 'weekly', label: AppConfig.strings.settings.notifications.weekly },
  ] as const;

  const handleSelectTime = async (_dateStr: string, timeStr: string, selectedWeekday?: number) => {
    const [h, m] = timeStr.split(':').map(Number);
    await onUpdateTime(h, m, selectedWeekday);
    setShowTimePicker(false);
  };

  const formattedTime = dayjs().hour(hour).minute(minute).format('HH:mm');
  const displayTime = formatClockTime(dayjs().hour(hour).minute(minute), resolvedHourCycle);

  return (
    <Stack space="sm" paddingHorizontal="md" paddingBottom="md">
      <Box flexDirection="row" alignItems="center" justifyContent="space-between">
        <AppSegmentedControl
          options={options}
          value={cadence}
          onChange={onUpdateCadence}
          minWidth={64}
          flex={false}
          size="sm"
        />

        <TouchableOpacity
          onPress={() => cadence !== 'none' && setShowTimePicker(true)}
          activeOpacity={cadence === 'none' ? 1 : Opacity.heavy}
          disabled={cadence === 'none'}
        >
          <Box
            flexDirection="row"
            alignItems="center"
            paddingHorizontal="md"
            paddingVertical="sm"
            borderRadius="full"
            background="surfaceSecondary"
            style={{ opacity: cadence === 'none' ? Opacity.muted : 1 }}
          >
            <AppText variant="caption" weight="semibold" color="text">
              {displayTime}
            </AppText>
            <AppIcon
              name="clock"
              size={14}
              color={theme.textSecondary}
              style={{ marginLeft: Spacing.xs, opacity: Opacity.heavy }}
            />
          </Box>
        </TouchableOpacity>
      </Box>

      {cadence !== 'none' && (
        <TouchableOpacity onPress={onSendTest}>
          <Box
            paddingVertical="xs"
            paddingHorizontal="md"
            borderRadius="sm"
            style={{ borderWidth: 1, borderColor: theme.border }}
            alignSelf="flex-start"
          >
            <AppText variant="caption" color="secondary">
              Send Test Notification (Now)
            </AppText>
          </Box>
        </TouchableOpacity>
      )}

      <DateTimePickerModal
        visible={showTimePicker}
        date={dayjs().format('YYYY-MM-DD')}
        time={formattedTime}
        weekday={weekday}
        showWeekdayPicker={cadence === 'weekly'}
        onClose={() => setShowTimePicker(false)}
        onSelect={handleSelectTime}
        hideDate
      />
    </Stack>
  );
};
