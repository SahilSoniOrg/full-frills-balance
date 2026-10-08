import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppText, IvyIcon } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

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
  const { width, fontScale } = useWindowDimensions();
  const stackBalances = width / fontScale < 320;
  const hasMultipleCurrencies = new Set(subAccounts.map(account => account.currencyCode)).size > 1;

  return (
    <ModalSurface
      visible={visible}
      title="Sub-Accounts"
      onClose={onClose}
      position="bottomSheet"
      animationType="fade"
      maxHeightPercent={70}
      fixedHeight={false}
      accessibilityCloseLabel="Close sub-accounts"
    >
      <View style={styles.summary}>
        <AppText variant="body" weight="medium">
          {parentName}
        </AppText>
        {!isLoading && (
          <AppText variant="caption" color="secondary">
            {subAccounts.length} {subAccounts.length === 1 ? 'sub-account' : 'sub-accounts'}
          </AppText>
        )}
      </View>
      {isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={theme.textSecondary} />
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
        <View>
          {subAccounts.map((account, index) => (
            <View
              key={account.id}
              style={[styles.accountRow, { paddingLeft: Math.min(account.level, 3) * Spacing.md }]}
            >
              <View style={styles.icon}>
                <IvyIcon
                  name={account.icon}
                  fallbackIcon={account.icon || 'wallet'}
                  label={account.name}
                  color={withOpacity(account.accountColor, Opacity.soft)}
                  iconColor={getReadableColor(account.accountColor, theme.surface)}
                  size={Size.xl}
                  shape="square"
                />
              </View>
              <View style={styles.accountContent}>
                <View style={[styles.accountDetails, stackBalances && styles.stackedDetails]}>
                  <View style={styles.accountName}>
                    <AppText variant="body" weight="medium" numberOfLines={2}>
                      {account.name}
                    </AppText>
                    {account.isGroup && (
                      <AppText variant="caption" color="secondary">
                        Group
                      </AppText>
                    )}
                  </View>
                  <View style={[styles.balance, stackBalances && styles.stackedBalance]}>
                    <MoneyText
                      amount={account.balanceAmount}
                      currencyCode={account.currencyCode}
                      variant="body"
                      weight="semibold"
                      align={stackBalances ? 'left' : 'right'}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    />
                    {hasMultipleCurrencies && (
                      <AppText
                        variant="caption"
                        color="secondary"
                        align={stackBalances ? 'left' : 'right'}
                      >
                        {account.currencyCode}
                      </AppText>
                    )}
                  </View>
                </View>
                {index < subAccounts.length - 1 && (
                  <View style={[styles.separator, { backgroundColor: theme.divider }]} />
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  accountRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  icon: {
    paddingTop: Spacing.md,
  },
  accountContent: {
    flex: 1,
    minWidth: 0,
  },
  accountDetails: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    minHeight: Size.xl + Spacing.md * 2,
    paddingVertical: Spacing.lg,
  },
  stackedDetails: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.xs,
  },
  accountName: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  balance: {
    maxWidth: '45%',
    flexShrink: 1,
    gap: Spacing.xs,
  },
  stackedBalance: {
    maxWidth: '100%',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  emptyContainer: {
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
    alignItems: 'center',
  },
});
