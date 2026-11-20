import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import type { ReactNode } from 'react';
import { ModalActions } from './ModalActions';

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
        <ModalActions actions={[{ label: doneLabel, onPress: onClose, testID: doneTestID }]} />
      }
    >
      {children}
    </ModalSurface>
  );
}
