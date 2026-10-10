import { StyleSheet, View } from 'react-native';
import { Icon, AppText, IvyIcon, type IconName, ListGroup, ListRow } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';

export interface AccountActionSheetProps {
  visible: boolean;
  account: AccountCardViewModel | null;
  onClose: () => void;
  onViewDetails?: (account: AccountCardViewModel) => void;
  onEdit?: (account: AccountCardViewModel) => void;
  onRecolor?: (account: AccountCardViewModel) => void;
  onReconcile?: (account: AccountCardViewModel) => void;
  onToggleArchive?: (account: AccountCardViewModel) => void;
  onDelete?: (account: AccountCardViewModel) => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
}

export function AccountActionSheet({
  visible,
  account,
  onClose,
  onViewDetails,
  onEdit,
  onRecolor,
  onReconcile,
  onToggleArchive,
  onDelete,
}: AccountActionSheetProps) {
  if (!account) return null;

  const actions: ActionItem[] = [
    {
      id: 'details',
      label: 'View Details',
      icon: Icon.Document,
      onPress: () => {
        onClose();
        onViewDetails?.(account);
      },
    },
    {
      id: 'edit',
      label: 'Edit Account',
      icon: Icon.Edit,
      onPress: () => {
        onClose();
        onEdit?.(account);
      },
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Icon.Palette,
      onPress: () => {
        onClose();
        onRecolor?.(account);
      },
    },
    {
      id: 'reconcile',
      label: 'Reconcile',
      icon: Icon.ShieldCheck,
      onPress: () => {
        onClose();
        onReconcile?.(account);
      },
    },
    {
      id: 'archive',
      label: account.isArchived ? 'Unarchive Account' : 'Archive Account',
      icon: Icon.Archive,
      onPress: () => {
        onClose();
        onToggleArchive?.(account);
      },
    },
    {
      id: 'delete',
      label: 'Delete Account',
      icon: Icon.Delete,
      destructive: true,
      onPress: () => {
        onClose();
        onDelete?.(account);
      },
    },
  ];

  return (
    <ModalSurface
      visible={visible}
      title={account.name}
      onClose={onClose}
      position="bottomSheet"
      fixedHeight={false}
      scrollable={false}
    >
      <View style={styles.contentContainer}>
        {/* Account preview chip */}
        <View
          style={[
            styles.accountChip,
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
          <AppText
            variant="body"
            weight="bold"
            numberOfLines={1}
            style={{ color: account.textColor, flex: 1, marginLeft: Spacing.sm }}
          >
            {account.name}
          </AppText>
        </View>

        <ListGroup>
          {actions.map(action => (
            <ListRow
              key={action.id}
              icon={action.icon}
              title={action.label}
              destructive={action.destructive}
              onPress={action.onPress}
              accessibilityLabel={action.label}
              chevron
            />
          ))}
        </ListGroup>
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
});
