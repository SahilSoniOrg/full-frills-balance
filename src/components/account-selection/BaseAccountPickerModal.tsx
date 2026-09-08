import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface BaseAccountPickerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BaseAccountPickerModal({
  visible,
  onClose,
  title,
  children,
}: BaseAccountPickerModalProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
        <Pressable
          testID="account-picker-modal-backdrop"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          testID="account-picker-modal-content"
          style={[styles.modalContent, { backgroundColor: theme.background }]}
        >
          <View style={styles.modalHeader}>
            <AppText variant="heading">{title}</AppText>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close"
              accessibilityRole="button"
              style={styles.headerIconButton}
            >
              <AppIcon name="close" size={Size.iconMd} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {visible ? (
            <ArchiveVisibilityScopeProvider>{children}</ArchiveVisibilityScopeProvider>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    ...StyleSheet.absoluteFill,
  },
  modalContent: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    height: '85%',
    width: '100%',
    elevation: 5,
    display: 'flex',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerIconButton: {
    padding: Spacing.xs,
  },
});
