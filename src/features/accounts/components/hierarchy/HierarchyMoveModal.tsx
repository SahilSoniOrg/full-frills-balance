import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import {
  DimensionValue,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';

interface HierarchyMoveModalProps {
  selectedAccountId: AccountId | null;
  selectedAccount: Account | undefined;
  parentCandidates: Account[];
  onSelectAccount: (accountId: AccountId | null) => void;
  onAssignParent: (accountId: AccountId, parentId: AccountId | null) => Promise<void>;
}

export function HierarchyMoveModal({
  selectedAccountId,
  selectedAccount,
  parentCandidates,
  onSelectAccount,
  onAssignParent,
}: HierarchyMoveModalProps) {
  const { theme } = useTheme();
  const close = () => onSelectAccount(null);

  return (
    <Modal
      visible={!!selectedAccountId}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={close}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay } as ViewStyle]}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalContent, { backgroundColor: theme.surface } as ViewStyle]}>
              <View style={styles.modalHeader}>
                <AppText variant="subheading" weight="bold">
                  {AppConfig.strings.accounts.hierarchy.modalTitle}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.accounts.hierarchy.modalDescription(
                    selectedAccount?.name || '',
                  )}
                </AppText>
              </View>

              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.destinationSection}>
                  <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
                    {AppConfig.strings.accounts.hierarchy.moveParentLabel}
                  </AppText>
                  {parentCandidates.map(candidate => (
                    <TouchableOpacity
                      key={candidate.id}
                      style={[
                        styles.destinationItem,
                        { borderBottomColor: theme.divider } as ViewStyle,
                      ]}
                      onPress={() =>
                        selectedAccountId && void onAssignParent(selectedAccountId, candidate.id)
                      }
                    >
                      <AppIcon
                        name={candidate.icon}
                        fallbackIcon={getAccountFallbackIcon(candidate.accountType)}
                        size={Size.iconSm}
                        color={theme.textSecondary}
                      />
                      <AppText variant="body" style={{ flex: 1 }}>
                        {candidate.name}
                      </AppText>
                      {selectedAccount?.parentAccountId === candidate.id && (
                        <AppIcon name="check" size={Size.iconSm} color={theme.success} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <AppButton onPress={close} variant="ghost" style={styles.cancelButton}>
                {AppConfig.strings.common.cancel}
              </AppButton>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    padding: Spacing.lg,
    maxHeight: AppConfig.layout.hierarchyModalHeightPercent as DimensionValue,
  },
  modalHeader: {
    marginBottom: Spacing.lg,
  },
  modalScroll: {
    marginBottom: Spacing.md,
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  destinationSection: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    letterSpacing: Typography.letterSpacing.wide * 2,
    marginBottom: Spacing.sm,
  },
  cancelButton: {
    marginTop: Spacing.sm,
  },
});
