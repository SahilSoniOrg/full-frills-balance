import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppText } from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { StyleSheet, View } from 'react-native';

export interface DayOfMonthSheetProps {
  visible: boolean;
  title: string;
  value: number | null;
  onSelect: (day: number) => void;
  onClose: () => void;
  testID?: string;
}

export function DayOfMonthSheet({
  visible,
  title,
  value,
  onSelect,
  onClose,
  testID,
}: DayOfMonthSheetProps) {
  const { theme } = useTheme();
  return (
    <ModalSurface
      visible={visible}
      title={title}
      accessibilityCloseLabel={copy.closeDialog}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      maxHeightPercent={75}
      footer={
        <ModalActions
          actions={[
            {
              label: copy.done,
              role: 'primary',
              onPress: onClose,
              accessibilityLabel: copy.doneAccessibility,
            },
          ]}
        />
      }
    >
      <View testID={testID} style={styles.grid}>
        {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
          <View key={day} style={styles.cell}>
            <PressScaleTouchable
              haptic="selection"
              testID={testID ? `${testID}-${day}` : undefined}
              accessibilityRole="button"
              accessibilityState={{ selected: value === day }}
              accessibilityLabel={day === 31 ? copy.lastDayOfMonth : copy.dayOfMonth(day)}
              onPress={() => {
                onSelect(day);
                onClose();
              }}
              style={[
                styles.dayButton,
                { backgroundColor: value === day ? theme.primary : 'transparent' },
              ]}
            >
              <AppText
                variant="bodySmall"
                style={{ color: value === day ? theme.onPrimary : theme.text }}
              >
                {day === 31 ? copy.lastDay : day}
              </AppText>
            </PressScaleTouchable>
          </View>
        ))}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.285%',
  },
  dayButton: {
    height: Size.touchTarget,
    margin: Spacing.xs / 2,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
