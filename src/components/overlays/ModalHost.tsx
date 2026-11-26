import { useEffect, useRef } from 'react';
import { BackHandler, Modal, Platform, StyleSheet, View, type ModalProps } from 'react-native';

type ModalHostProps = ModalProps & {
  visible: boolean;
  useNativeModal?: boolean;
};

/** Reports dismissal once the host can present another surface. */
export function ModalHost({
  visible,
  useNativeModal = true,
  onDismiss,
  onRequestClose,
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

  useEffect(() => {
    if (!visible || useNativeModal || !onRequestClose || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      (onRequestClose as () => void)();
      return true;
    });
    return () => subscription.remove();
  }, [visible, useNativeModal, onRequestClose]);

  if (!useNativeModal) {
    return visible ? <View style={styles.inline}>{children}</View> : null;
  }

  return (
    <Modal
      {...props}
      visible={visible}
      onRequestClose={onRequestClose}
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
  inline: { ...StyleSheet.absoluteFill, zIndex: 9999 },
});
