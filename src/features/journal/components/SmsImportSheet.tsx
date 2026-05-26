import { AppButton, AppText } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { Modal, StyleSheet, View } from 'react-native';

interface SmsImportSheetProps {
  onClose?: () => void;
}

export const SmsImportSheet = ({ onClose }: SmsImportSheetProps) => {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          <AppText variant="subheading">SMS import moved</AppText>
          <AppText variant="body" color="secondary">
            Open the dedicated SMS Inbox to review pending, processed, duplicate, and auto-posted
            messages.
          </AppText>
          <View style={styles.actions}>
            <AppButton
              onPress={() => {
                onClose?.();
                AppNavigation.toSmsInbox();
              }}
            >
              Open SMS Inbox
            </AppButton>
            <AppButton variant="secondary" onPress={onClose}>
              Close
            </AppButton>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: withOpacity('#000000', Opacity.medium),
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
