import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppButton, AppText, Badge, IvyIcon } from '@/src/components/core';
import { Opacity, Spacing } from '@/src/constants';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { withOpacity } from '@/src/utils/color-math';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface SubAccountListModalProps {
  visible: boolean;
  onClose: () => void;
  parentName: string;
  subAccounts: SubAccountViewModel[];
  isLoading: boolean;
}

export function SubAccountListModal({
  visible,
  onClose,
  parentName,
  subAccounts,
  isLoading,
}: SubAccountListModalProps) {
  const { theme } = useTheme();

  return (
    <ModalSurface
      visible={visible}
      title="Sub-Accounts"
      onClose={onClose}
      position="bottomSheet"
      animationType="fade"
      maxHeightPercent={70}
      fixedHeight={false}
      footer={
        <View style={styles.footer}>
          <AppButton onPress={onClose} variant="ghost">
            Close
          </AppButton>
        </View>
      }
    >
      <AppText variant="caption" color="secondary">
        Details for &quot;{parentName}&quot;
      </AppText>
      {isLoading ? (
        <View style={styles.emptyContainer}>
          <AppText variant="body" color="secondary">
            Loading sub-accounts...
          </AppText>
        </View>
      ) : subAccounts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <AppText variant="body" color="secondary">
            No sub-accounts found
          </AppText>
        </View>
      ) : (
        subAccounts.map((account, index) => (
          <View
            key={`${account.id}-${index}`}
            style={[styles.accountRow, { borderBottomColor: theme.divider }]}
          >
            {account.level > 0 &&
              Array.from({ length: account.level }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.indentation,
                    {
                      width: Spacing.lg,
                      borderLeftWidth: 1,
                      borderLeftColor: withOpacity(theme.textTertiary, Opacity.hover),
                    },
                  ]}
                />
              ))}
            <View style={styles.accountLeft}>
              <IvyIcon
                name={account.icon}
                fallbackIcon={account.icon || 'wallet'}
                label={account.name}
                color={account.accountColor}
                size={36}
                shape="square"
              />
              <AppText variant="body" weight="medium" style={styles.accountName} numberOfLines={1}>
                {account.name}
              </AppText>
              {account.isGroup && (
                <Badge
                  variant="primary"
                  size="sm"
                  style={styles.badge}
                  backgroundColor={withOpacity(account.categoryColor, Opacity.hover)}
                  textColor={account.categoryColor}
                >
                  Group
                </Badge>
              )}
            </View>
            <MoneyText
              amount={account.balanceAmount}
              currencyCode={account.currencyCode}
              variant="body"
              weight="bold"
            />
          </View>
        ))
      )}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountName: {
    maxWidth: '50%',
    marginRight: Spacing.xs,
  },
  badge: {
    marginLeft: 0,
    alignSelf: 'center',
  },
  indentation: {
    height: 24,
    alignSelf: 'center',
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
});
