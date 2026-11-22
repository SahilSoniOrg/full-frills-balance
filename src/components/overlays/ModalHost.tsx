import { useEffect, useRef } from 'react';
import { Modal, Platform, StyleSheet, View, type ModalProps } from 'react-native';

type ModalHostProps = ModalProps & {
  visible: boolean;
  useNativeModal?: boolean;
};

/** Reports dismissal once the host can present another surface. */
export function ModalHost({
  visible,
  useNativeModal = true,
  onDismiss,
  animationType,
  children,
  ...props
}: ModalHostProps) {
  const nativeDismiss = useNativeModal && (Platform.OS === 'ios' || Platform.OS === 'web');
  const wasVisible = useRef(false);
  useEffect(() => {
    const closed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (closed && !nativeDismiss) onDismiss?.();
  }, [visible, nativeDismiss, onDismiss]);

  if (!useNativeModal) {
    return visible ? <View style={styles.inline}>{children}</View> : null;
  }

  return (
    <Modal
      {...props}
      visible={visible}
      // Android removes the dialog when the hidden render commits. Disable its
      // window animation for handoffs so there is no exit animation to wait for.
      animationType={onDismiss && !nativeDismiss ? 'none' : animationType}
      onDismiss={nativeDismiss ? onDismiss : undefined}
    >
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  inline: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
});
