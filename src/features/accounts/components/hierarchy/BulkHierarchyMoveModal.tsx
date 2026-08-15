import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { HierarchyCandidateAccount } from '@/src/features/accounts/helpers/bulkHierarchyCandidates';
export type { HierarchyCandidateAccount } from '@/src/features/accounts/helpers/bulkHierarchyCandidates';

export interface BulkHierarchyMoveModalProps {
  visible: boolean;
  selectedCount: number;
  parentCandidates: HierarchyCandidateAccount[];
  onClose: () => void;
  onAssignParent: (parentId: AccountId | null) => Promise<void> | void;
}

export function BulkHierarchyMoveModal({
  visible,
  selectedCount,
  parentCandidates,
  onClose,
  onAssignParent,
}: BulkHierarchyMoveModalProps) {
  const { theme } = useTheme();
  const [isAssigning, setIsAssigning] = useState(false);

  const assignParent = async (parentId: AccountId | null) => {
    if (isAssigning) return;
    setIsAssigning(true);
    try {
      await onAssignParent(parentId);
      onClose();
    } catch {
      // The caller owns error presentation. Keep this modal open for retry.
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <ModalSurface
      visible={visible}
      onClose={onClose}
      title="Move Accounts"
      fixedHeight={false}
      scrollable={true}
      accessibilityCloseLabel="Close move modal"
      footer={
        <AppButton variant="ghost" onPress={onClose} style={styles.cancelButton}>
          Cancel
        </AppButton>
      }
    >
      <AppText variant="caption" color="secondary" style={styles.subtitle}>
        {`Select a new parent account for ${selectedCount} selected account${
          selectedCount === 1 ? '' : 's'
        }.`}
      </AppText>

      <TouchableOpacity
        style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
        onPress={() => void assignParent(null)}
        disabled={isAssigning}
        accessibilityRole="button"
        accessibilityLabel="None (Root Level)"
      >
        <View style={[styles.rootIconFrame, { backgroundColor: theme.surfaceSecondary }]}>
          <AppIcon name="hierarchy" size={Size.iconSm} color={theme.primary} />
        </View>
        <AppText variant="body" weight="medium" style={styles.itemText}>
          None (Root Level)
        </AppText>
      </TouchableOpacity>

      {parentCandidates.map(candidate => (
        <TouchableOpacity
          key={candidate.id}
          style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
          onPress={() => void assignParent(candidate.id as AccountId)}
          disabled={isAssigning}
          accessibilityRole="button"
          accessibilityLabel={candidate.name}
        >
          <AppIcon
            name={candidate.icon}
            fallbackIcon={getAccountFallbackIcon(candidate.accountType)}
            size={Size.iconMd}
            color={theme.textSecondary}
          />
          <AppText variant="body" style={styles.itemText}>
            {candidate.name}
          </AppText>
        </TouchableOpacity>
      ))}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginBottom: Spacing.sm,
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  rootIconFrame: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
  },
  cancelButton: {
    marginTop: Spacing.xs,
  },
});
