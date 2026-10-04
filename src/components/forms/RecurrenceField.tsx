import {
  AppIcon,
  AppInputField,
  AppSegmentedControl,
  AppText,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { isValidRepeatCount } from '@/src/utils/recurrenceLabels';
import { useState } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';

const units: Record<string, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

interface Props {
  intervalType: string;
  value: number;
  onChange: (value: number) => void;
  onIntervalTypeChange: (value: PlannedPaymentInterval) => void;
  testID: string;
  unitTestID?: string;
}

export function RecurrenceField({
  intervalType,
  value,
  onChange,
  onIntervalTypeChange,
  testID,
  unitTestID,
}: Props) {
  const { theme, fonts } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [showUnits, setShowUnits] = useState(false);
  const unit = units[intervalType] ?? 'month';
  const valid = isValidRepeatCount(value);
  const suffix = value === 1 ? '' : 's';

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <AppText variant="body" color="secondary">
          Every
        </AppText>
        <AppInputField
          width={(Size.touchTarget + Spacing.lg) * Math.max(1, fontScale)}
          paddingHorizontal="xs"
          borderRadius="r2"
          borderColor={valid ? 'border' : 'error'}
          value={Number.isNaN(value) ? '' : String(value)}
          onChangeText={text => onChange(text.trim() === '' ? Number.NaN : Number(text))}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={`Repeat every, number of ${unit}s`}
          testID={testID}
          inputStyle={{ textAlign: 'center', fontFamily: fonts.semibold }}
        />
        <PressScaleTouchable
          testID={`${testID}-unit`}
          accessibilityRole="button"
          accessibilityLabel={`Repeat unit, ${unit}${suffix}`}
          accessibilityState={{ expanded: showUnits }}
          onPress={() => {
            Keyboard.dismiss();
            setShowUnits(!showUnits);
          }}
          surfaceStyle={[styles.unit, { borderBottomColor: theme.border }]}
        >
          <AppText variant="body" weight="semibold" color="primary">{`${unit}${suffix}`}</AppText>
          <AppIcon
            name={showUnits ? Icon.ChevronUp : Icon.ChevronDown}
            size={Size.iconSm}
            color={theme.textSecondary}
          />
        </PressScaleTouchable>
      </View>
      {showUnits && (
        <AppSegmentedControl
          flex={fontScale <= 1.2}
          scrollable={fontScale > 1.2}
          itemWidth={fontScale > 1.2 ? Size.touchTarget * fontScale * 2 : undefined}
          itemHeight={Size.touchTarget}
          size="sm"
          variant="minimal"
          testID={unitTestID}
          options={Object.values(PlannedPaymentInterval).map(id => ({
            id,
            label: `${units[id]}${suffix}`,
          }))}
          value={intervalType as PlannedPaymentInterval}
          onChange={type => {
            onIntervalTypeChange(type);
            setShowUnits(false);
          }}
        />
      )}
      {!valid && (
        <AppText variant="caption" color="error">
          Enter a whole number from 1 to 9999.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  unit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    minHeight: Size.inputMd,
    borderBottomWidth: 1,
  },
});
