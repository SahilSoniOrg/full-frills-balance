import { AppButton, AppText } from '@/src/components/core'
import { Colors, Spacing } from '@/src/constants'
import { AppNavigation } from '@/src/utils/navigation'
import React from 'react'
import { Modal, StyleSheet, View } from 'react-native'

interface SmsImportSheetProps {
  onClose?: () => void
}

export const SmsImportSheet = ({ onClose }: SmsImportSheetProps) => {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <AppText variant="subheading">SMS import moved</AppText>
          <AppText variant="body" color="secondary">
            Open the dedicated SMS Inbox to review pending, processed, duplicate, and auto-posted messages.
          </AppText>
          <View style={styles.actions}>
            <AppButton
              onPress={() => {
                onClose?.()
                AppNavigation.toSmsInbox()
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
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.light.surface,
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
})
