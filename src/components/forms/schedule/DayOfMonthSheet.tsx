import { AppButton, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Size, Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import { Pressable, View } from 'react-native';

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
        <View style={{ paddingTop: Spacing.md }}>
          <AppButton
            variant="secondary"
            onPress={onClose}
            accessibilityLabel={copy.doneAccessibility}
          >
            {copy.done}
          </AppButton>
        </View>
      }
    >
      <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
          <View key={day} style={{ width: '14.285%' }}>
            <Pressable
              testID={testID ? `${testID}-${day}` : undefined}
              accessibilityRole="button"
              accessibilityState={{ selected: value === day }}
              accessibilityLabel={day === 31 ? copy.lastDayOfMonth : copy.dayOfMonth(day)}
              onPress={() => {
                onSelect(day);
                onClose();
              }}
              style={{
                height: Size.touchTarget,
                margin: 2,
                borderRadius: Size.touchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: value === day ? theme.primary : 'transparent',
              }}
            >
              <AppText
                variant="bodySmall"
                style={{ color: value === day ? theme.onPrimary : theme.text }}
              >
                {day === 31 ? copy.lastDay : day}
              </AppText>
            </Pressable>
          </View>
        ))}
      </View>
    </ModalSurface>
  );
}
