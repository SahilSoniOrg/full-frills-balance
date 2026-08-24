import { BulkActionModalSurface } from '@/src/components/common/BulkActionModalSurface';
import { AppInput, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { AccountId } from '@/src/types/domain';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface BulkRenameAccountsModalProps {
  visible: boolean;
  accounts: AccountCardViewModel[];
  onClose: () => void;
  onSave: (namesByAccountId: Record<AccountId, string>) => Promise<void> | void;
}

function BulkRenameAccountsModalContent({
  accounts,
  onClose,
  onSave,
}: Omit<BulkRenameAccountsModalProps, 'visible'>) {
  const [namesOverride, setNamesOverride] = useState<Record<AccountId, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleTextChange = (accountId: AccountId, text: string) => {
    setNamesOverride(prev => ({
      ...prev,
      [accountId]: text,
    }));
  };

  const handleSave = async () => {
    const finalNames: Record<AccountId, string> = {};
    accounts.forEach(account => {
      const accountId = account.id;
      finalNames[accountId] = namesOverride[accountId] ?? account.name;
    });
    setIsSaving(true);
    try {
      await onSave(finalNames);
      onClose();
    } catch {
      // The caller owns error presentation. Keep the draft open for retry.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BulkActionModalSurface
      visible={true}
      onClose={onClose}
      title="Edit Account Names"
      itemCount={accounts.length}
      confirmLabel="Save Changes"
      confirmAccessibilityLabel="Save Changes"
      cancelAccessibilityLabel="Cancel rename"
      onConfirm={handleSave}
      isSubmitting={isSaving}
      testID="bulk-rename-accounts-modal"
    >
      {accounts.map(account => {
        const accountId = account.id;
        const currentName = namesOverride[accountId] ?? account.name;

        return (
          <View key={accountId} style={styles.accountRow}>
            <View
              style={[
                styles.categoryIconFrame,
                {
                  backgroundColor: account.accountColor,
                  borderColor: withOpacity(account.categoryColor, Opacity.soft),
                },
              ]}
            >
              <IvyIcon
                name={account.icon}
                label={account.name}
                color={account.textColor}
                size={Size.avatarSm}
              />
            </View>
            <View style={styles.inputContainer}>
              <AppInput
                value={currentName}
                onChangeText={text => handleTextChange(accountId, text)}
                placeholder="Account name"
                variant="default"
                accessibilityLabel={`Rename ${account.name}`}
              />
            </View>
          </View>
        );
      })}
    </BulkActionModalSurface>
  );
}

export function BulkRenameAccountsModal({
  visible,
  accounts,
  onClose,
  onSave,
}: BulkRenameAccountsModalProps) {
  if (!visible) return null;
  return <BulkRenameAccountsModalContent accounts={accounts} onClose={onClose} onSave={onSave} />;
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  categoryIconFrame: {
    padding: Spacing.xs / 2,
    borderWidth: 2,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
  },
});
