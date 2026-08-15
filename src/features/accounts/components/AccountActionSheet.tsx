import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppIcon, AppText, IvyIcon, type IconName } from '@/src/components/core';
import { ModalSurface } from '@/src/components/common/ModalSurface';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';

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
  const { theme } = useTheme();

  if (!account) return null;

  const actions: ActionItem[] = [
    {
      id: 'details',
      label: 'View Details',
      icon: 'fileText',
      onPress: () => {
        onClose();
        onViewDetails?.(account);
      },
    },
    {
      id: 'edit',
      label: 'Edit Account',
      icon: 'edit',
      onPress: () => {
        onClose();
        onEdit?.(account);
      },
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: 'palette',
      onPress: () => {
        onClose();
        onRecolor?.(account);
      },
    },
    {
      id: 'reconcile',
      label: 'Reconcile',
      icon: 'shieldCheck',
      onPress: () => {
        onClose();
        onReconcile?.(account);
      },
    },
    {
      id: 'archive',
      label: account.isArchived ? 'Unarchive Account' : 'Archive Account',
      icon: 'archive',
      onPress: () => {
        onClose();
        onToggleArchive?.(account);
      },
    },
    {
      id: 'delete',
      label: 'Delete Account',
      icon: 'trash',
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

        {/* Action items list */}
        <View style={styles.actionsList}>
          {actions.map(action => {
            const itemColor = action.destructive ? theme.error : theme.text;
            return (
              <TouchableOpacity
                key={action.id}
                onPress={action.onPress}
                activeOpacity={Opacity.heavy}
                style={[styles.actionRow, { borderBottomColor: theme.border }]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={styles.actionLeft}>
                  <AppIcon
                    name={action.icon}
                    size={Size.iconMd}
                    color={action.destructive ? theme.error : theme.primary}
                  />
                  <AppText
                    variant="body"
                    weight="medium"
                    style={{ color: itemColor, marginLeft: Spacing.md }}
                  >
                    {action.label}
                  </AppText>
                </View>
                <AppIcon name="chevronRight" size={Size.iconSm} color={theme.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
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
  actionsList: {
    gap: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
