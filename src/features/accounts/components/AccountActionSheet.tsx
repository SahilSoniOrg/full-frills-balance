import { StyleSheet, View } from 'react-native';
import {
  Icon,
  AppText,
  IvyIcon,
  type IconName,
  ListGroup,
  type ListRowItem,
} from '@/src/components/core';
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

  type Handler = ((account: AccountCardViewModel) => void) | undefined;
  /** Close the sheet, then run the action for this account. */
  const action = (
    id: string,
    title: string,
    icon: IconName,
    run: Handler,
    destructive?: boolean,
  ): ListRowItem => ({
    id,
    title,
    icon,
    destructive,
    onPress: () => {
      onClose();
      run?.(account);
    },
  });
  const actions = [
    action('details', 'View Details', Icon.Document, onViewDetails),
    action('edit', 'Edit Account', Icon.Edit, onEdit),
    action('appearance', 'Appearance', Icon.Palette, onRecolor),
    action('reconcile', 'Reconcile', Icon.ShieldCheck, onReconcile),
    action(
      'archive',
      account.isArchived ? 'Unarchive Account' : 'Archive Account',
      Icon.Archive,
      onToggleArchive,
    ),
    action('delete', 'Delete Account', Icon.Delete, onDelete, true),
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

        <ListGroup items={actions} rowProps={{ chevron: true }} />
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
