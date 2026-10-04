import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { ReactNode } from 'react';

export interface BaseAccountPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  title?: string;
  children: ReactNode;
}

export function BaseAccountPickerModal({
  visible,
  onClose,
  onDismiss,
  title,
  children,
}: BaseAccountPickerModalProps) {
  return (
    <ModalSurface
      visible={visible}
      title={title ?? 'Select account'}
      onClose={onClose}
      onDismiss={onDismiss}
      position="bottomSheet"
      animationType="slide"
      fixedHeight
      scrollable={false}
      contentTestID="account-picker-modal-content"
      backdropTestID="account-picker-modal-backdrop"
    >
      {visible ? <ArchiveVisibilityScopeProvider>{children}</ArchiveVisibilityScopeProvider> : null}
    </ModalSurface>
  );
}
