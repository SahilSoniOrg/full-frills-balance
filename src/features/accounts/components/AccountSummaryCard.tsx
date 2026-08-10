import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppText, Badge, IconButton, IvyIcon } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import { Pressable, StyleSheet, View } from 'react-native';

export interface AccountSummaryCardProps {
  accountName: string;
  accountIcon: string | null;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: string;
  accountTypeColorKey: string;
  isParent: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceAmount: number | null;
  currencyCode: string;
  secondaryBalances: { currencyCode: string; amount: number }[];
  transactionCountText: string;
  reconciledAt: Date | null;
  onAuditPress: () => void;
}

export function AccountSummaryCard({
  accountName,
  accountIcon,
  accountType,
  accountSubtypeLabel,
  accountTypeVariant,
  accountTypeColorKey,
  isParent,
  isDeleted,
  isArchived,
  subAccountCount,
  onShowSubAccounts,
  balanceAmount,
  secondaryBalances,
  transactionCountText,
  reconciledAt,
  currencyCode,
  onAuditPress,
}: AccountSummaryCardProps) {
  const { theme } = useTheme();

  return (
    <AppCard elevation="sm" style={[styles.accountInfoCard, isArchived && styles.archivedCard]}>
      <View style={styles.accountHeader}>
        <IvyIcon
          name={accountIcon || undefined}
          fallbackIcon={getAccountFallbackIcon(accountType)}
          label={accountName}
          color={theme[accountTypeColorKey as keyof typeof theme] as string}
          size={Size.avatarMd}
          shape={isParent ? 'square' : 'circle'}
        />
        <View style={styles.titleInfo}>
          <AppText variant="title">{accountName}</AppText>
          <View style={styles.badgesRow}>
            <Badge variant={accountTypeVariant as any}>{accountType}</Badge>
            {accountSubtypeLabel ? (
              <Badge variant={accountTypeVariant as any}>{accountSubtypeLabel}</Badge>
            ) : null}
            {isParent ? (
              <Pressable
                onPress={onShowSubAccounts}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Badge variant={accountTypeVariant as any} icon="hierarchy">
                  {subAccountCount} {subAccountCount === 1 ? 'SUB-ACCOUNT' : 'SUB-ACCOUNTS'}
                </Badge>
              </Pressable>
            ) : null}
            {isDeleted ? <Badge variant="expense">DELETED</Badge> : null}
            {isArchived ? (
              <Badge variant="default" icon="archive">
                {AppConfig.strings.accounts.archive.archivedBadge}
              </Badge>
            ) : null}
            {reconciledAt ? (
              <Badge variant="success" icon="shieldCheck">
                {formatRelativeReconciledDate(reconciledAt)}
              </Badge>
            ) : null}
          </View>
        </View>
        <IconButton
          name="history"
          onPress={onAuditPress}
          variant="surface"
          iconColor={theme.textSecondary}
          accessibilityLabel="View account history"
          testID="audit-button"
        />
      </View>

      <View style={styles.accountStats}>
        <View style={styles.statItem}>
          <AppText variant="caption" color="secondary">
            Current Balance
          </AppText>
          <MoneyText
            amount={balanceAmount ?? 0}
            currencyCode={currencyCode}
            variant="heading"
            loading={balanceAmount === null}
          />
          {secondaryBalances.length > 0 ? (
            <View style={styles.secondaryBalances}>
              {secondaryBalances.map((balance, index) => (
                <MoneyText
                  key={index}
                  amount={balance.amount}
                  currencyCode={balance.currencyCode}
                  prefix="+ "
                  variant="caption"
                  color="secondary"
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.statItem}>
          <AppText variant="caption" color="secondary">
            Transactions
          </AppText>
          <AppText variant="subheading">{transactionCountText}</AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  accountInfoCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Shape.radius.xl,
  },
  archivedCard: {
    opacity: Opacity.medium,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  titleInfo: {
    marginLeft: Spacing.md,
    flex: 1,
    gap: Spacing.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    rowGap: Spacing.xs,
    alignItems: 'center',
  },
  accountStats: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
  },
  secondaryBalances: {
    marginTop: Spacing.xs,
    gap: 2,
  },
});
