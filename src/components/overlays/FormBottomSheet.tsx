import { AppButton } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Spacing } from '@/src/constants';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type FormBottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  doneLabel: string;
  doneTestID?: string;
  closeTestID?: string;
  accessibilityCloseLabel?: string;
  maxHeightPercent?: number;
  scrollable?: boolean;
};

/** Bottom sheet with a single Done/Save footer — note editors, short form sheets. */
export function FormBottomSheet({
  visible,
  title,
  onClose,
  children,
  doneLabel,
  doneTestID,
  closeTestID,
  accessibilityCloseLabel,
  maxHeightPercent,
  scrollable = true,
}: FormBottomSheetProps) {
  return (
    <ModalSurface
      keyboardAvoiding
      visible={visible}
      title={title}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable={scrollable}
      maxHeightPercent={maxHeightPercent}
      accessibilityCloseLabel={accessibilityCloseLabel}
      closeTestID={closeTestID}
      footer={
        <View style={styles.footer}>
          <AppButton onPress={onClose} testID={doneTestID}>
            {doneLabel}
          </AppButton>
        </View>
      }
    >
      {children}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingTop: Spacing.md,
  },
});
