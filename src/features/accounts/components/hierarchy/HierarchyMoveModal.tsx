import { Icon, AppButton, AppIcon, AppText } from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Size, Spacing, Typography } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import type { AccountFields } from '@/src/types/plainDtos';
import { getAccountFallbackIcon, getAccountIcon } from '@/src/utils/accountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/ids';
import { StyleSheet, View, type ViewStyle } from 'react-native';

interface HierarchyMoveModalProps {
  selectedAccountId: AccountId | null;
  selectedAccount: AccountFields | undefined;
  parentCandidates: AccountFields[];
  isSaving: boolean;
  onSelectAccount: (accountId: AccountId | null) => void;
  onAssignParent: (accountId: AccountId, parentId: AccountId | null) => Promise<void>;
  onDismiss: () => void;
}

export function HierarchyMoveModal({
  selectedAccountId,
  selectedAccount,
  parentCandidates,
  isSaving,
  onSelectAccount,
  onAssignParent,
  onDismiss,
}: HierarchyMoveModalProps) {
  const { theme } = useTheme();
  const close = () => onSelectAccount(null);
  const maxHeightPercent = Number.parseInt(
    String(AppConfig.layout.hierarchyModalHeightPercent),
    10,
  );

  return (
    <ModalSurface
      visible={!!selectedAccountId}
      title={AppConfig.strings.accounts.hierarchy.modalTitle}
      onClose={close}
      onDismiss={onDismiss}
      position="bottomSheet"
      maxHeightPercent={Number.isFinite(maxHeightPercent) ? maxHeightPercent : 80}
      fixedHeight={false}
      accessibilityCloseLabel="Close move account dialog"
      footer={
        <AppButton onPress={close} variant="ghost" style={styles.cancelButton}>
          {AppConfig.strings.common.cancel}
        </AppButton>
      }
    >
      <AppText variant="caption" color="secondary">
        {AppConfig.strings.accounts.hierarchy.modalDescription(selectedAccount?.name || '')}
      </AppText>

      <View style={styles.destinationSection}>
        <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
          {AppConfig.strings.accounts.hierarchy.moveParentLabel}
        </AppText>
        <PressScaleTouchable
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Top level (no group)"
          style={[styles.destinationItem, { borderBottomColor: theme.divider } as ViewStyle]}
          surfaceStyle={styles.destinationSurface}
          onPress={() => selectedAccountId && void onAssignParent(selectedAccountId, null)}
        >
          <AppIcon name={Icon.Eject} size={Size.iconSm} color={theme.textSecondary} />
          <AppText variant="body" style={styles.destinationLabel}>
            Top level (no group)
          </AppText>
          {!selectedAccount?.parentAccountId && (
            <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.success} />
          )}
        </PressScaleTouchable>
        {parentCandidates.map(candidate => (
          <PressScaleTouchable
            disabled={isSaving}
            key={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={candidate.name}
            style={[styles.destinationItem, { borderBottomColor: theme.divider } as ViewStyle]}
            surfaceStyle={styles.destinationSurface}
            onPress={() =>
              selectedAccountId && void onAssignParent(selectedAccountId, candidate.id)
            }
          >
            <AppIcon
              name={getAccountIcon(candidate)}
              fallbackIcon={getAccountFallbackIcon(candidate.accountType)}
              size={Size.iconSm}
              color={theme.textSecondary}
            />
            <AppText variant="body" style={styles.destinationLabel}>
              {candidate.name}
            </AppText>
            {selectedAccount?.parentAccountId === candidate.id && (
              <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.success} />
            )}
          </PressScaleTouchable>
        ))}
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  destinationItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  destinationSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  destinationLabel: { flex: 1 },
  destinationSection: {
    marginTop: Spacing.sm,
  },
  sectionLabel: {
    letterSpacing: Typography.letterSpacing.wide * 2,
    marginBottom: Spacing.sm,
  },
  cancelButton: {
    marginTop: Spacing.sm,
  },
});
