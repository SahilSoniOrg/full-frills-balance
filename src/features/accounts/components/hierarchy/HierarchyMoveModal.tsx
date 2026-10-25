import { AppButton, AppIcon, AppText, Icon, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SelectionCheckmark } from '@/src/components/shared/SelectionIndicator';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { getAccountFallbackIcon, getAccountIcon } from '@/src/utils/accountIcon';
import { StyleSheet } from 'react-native';

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

      <ListGroup
        variant="plain"
        header={AppConfig.strings.accounts.hierarchy.moveParentLabel}
        dividerInset="none"
      >
        <ListRow
          title="Top level (no group)"
          icon={Icon.Eject}
          disabled={isSaving}
          trailing={
            <SelectionCheckmark
              selected={!selectedAccount?.parentAccountId}
              color={theme.success}
            />
          }
          chevron={false}
          onPress={() => selectedAccountId && void onAssignParent(selectedAccountId, null)}
          accessibilityLabel="Top level (no group)"
        />
        {parentCandidates.map(candidate => (
          <ListRow
            key={candidate.id}
            title={candidate.name}
            leading={
              <AppIcon
                name={getAccountIcon(candidate)}
                fallbackIcon={getAccountFallbackIcon(candidate.accountType)}
                size={20}
                color={theme.textSecondary}
              />
            }
            disabled={isSaving}
            trailing={
              <SelectionCheckmark
                selected={selectedAccount?.parentAccountId === candidate.id}
                color={theme.success}
              />
            }
            chevron={false}
            onPress={() =>
              selectedAccountId && void onAssignParent(selectedAccountId, candidate.id)
            }
            accessibilityLabel={candidate.name}
          />
        ))}
      </ListGroup>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  cancelButton: {
    marginTop: Spacing.sm,
  },
});
