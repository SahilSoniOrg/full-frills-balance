import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppInput, AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
  const { theme } = useTheme();
  const [namesOverride, setNamesOverride] = useState<Record<AccountId, string>>({});

  const handleTextChange = (accountId: AccountId, text: string) => {
    setNamesOverride(prev => ({
      ...prev,
      [accountId]: text,
    }));
  };

  const handleSave = async () => {
    const finalNames: Record<AccountId, string> = {};
    accounts.forEach(account => {
      const accountId = account.id as AccountId;
      finalNames[accountId] = namesOverride[accountId] ?? account.name;
    });
    try {
      await onSave(finalNames);
      onClose();
    } catch {
      // The caller owns error presentation. Keep the draft open for retry.
    }
  };

  return (
    <ModalSurface
      visible={true}
      onClose={onClose}
      title="Edit Account Names"
      fixedHeight={false}
      scrollable={true}
      accessibilityCloseLabel="Close rename modal"
      footer={
        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.footerButton, styles.cancelButton, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel rename"
          >
            <AppText variant="body" weight="medium" color="secondary">
              Cancel
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.footerButton, styles.saveButton, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
          >
            <AppText variant="body" weight="bold" style={{ color: theme.background }}>
              Save Changes
            </AppText>
          </TouchableOpacity>
        </View>
      }
    >
      {accounts.map(account => {
        const accountId = account.id as AccountId;
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
    </ModalSurface>
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
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Shape.radius.r3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  saveButton: {},
});
