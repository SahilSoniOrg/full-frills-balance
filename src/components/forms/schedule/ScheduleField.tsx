import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppText, Icon, AppIcon } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { getReadableColor } from '@/src/utils/color-math';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { useState } from 'react';
import { View } from 'react-native';
import { ScheduleSheet } from './ScheduleSheet';
import { formatScheduleSentence, previewOccurrences } from './formatSchedule';
import type { ScheduleValue } from './types';

export interface ScheduleFieldProps {
  value: ScheduleValue;
  startDate: number;
  onChange: (value: ScheduleValue) => void;
  label?: string;
  intervalTestIDPrefix?: string;
  testID?: string;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function ScheduleField({
  value,
  startDate,
  onChange,
  label = copy.schedule,
  intervalTestIDPrefix,
  testID,
}: ScheduleFieldProps) {
  const [visible, setVisible] = useState(false);
  const { theme } = useTheme();
  // Tokens are readable in Deep Space; the guard keeps other themes' accents legible.
  const accent = getReadableColor(theme.primary, theme.surfaceSecondary);
  const parts = formatScheduleSentence(value);
  const dates = previewOccurrences(value, startDate);
  return (
    <>
      {label ? (
        <AppText
          variant="caption"
          weight="semibold"
          color="secondary"
          style={{ letterSpacing: 0.5, marginTop: Spacing.md }}
        >
          {label.toUpperCase()}
        </AppText>
      ) : null}
      <PressScaleTouchable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={copy.editSchedule(parts.map(part => part.text).join(''))}
        onPress={() => setVisible(true)}
        style={{ paddingVertical: Spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          {parts.map((part, index) => (
            <AppText
              key={index}
              variant="bodyLarge"
              weight={part.emphasized ? 'semibold' : 'regular'}
              style={part.emphasized ? { color: accent } : undefined}
            >
              {part.text}
            </AppText>
          ))}
          <AppIcon name={Icon.ChevronRight} size={20} color={theme.textSecondary} />
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.xs }}>
          {dates.map((date, index) => (
            <AppText key={`${date}-${index}`} variant="caption" color="secondary">
              {index === 0 ? copy.next : ''}
              {dateFormat.format(date)}
            </AppText>
          ))}
        </View>
      </PressScaleTouchable>
      <ScheduleSheet
        visible={visible}
        value={value}
        startDate={startDate}
        onDone={next => {
          onChange(next);
          setVisible(false);
        }}
        onClose={() => setVisible(false)}
        intervalTestIDPrefix={intervalTestIDPrefix}
      />
    </>
  );
}
