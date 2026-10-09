import { MoneyText } from '@/src/components/shared/MoneyText';
import {
  Icon,
  AppIcon,
  AppText,
  Badge,
  IconButton,
  IvyIcon,
  type IconName,
} from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { AccountParentPath } from '@/src/features/accounts/components/AccountParentPath';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import type { AccountSummaryCardModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import { isCategoryAccountType, resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { Pressable, StyleSheet, View } from 'react-native';

export type AccountSummaryCardProps = AccountSummaryCardModel & {
  currencyCode: string;
};

function accountTypeLabel(accountType: string) {
  const labels: Record<string, string> = AppConfig.strings.accounts.types;
  return labels[accountType.toLowerCase()] ?? accountType;
}

function SummaryAction({
  icon,
  iconColor,
  label,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  trailing?: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.summaryAction,
        { backgroundColor: withOpacity(iconColor, Opacity.soft) },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon
        name={icon}
        size={Size.iconXs}
        color={getReadableColor(iconColor, theme.background)}
      />
      <AppText variant="caption" weight="medium" style={styles.actionLabel}>
        {label}
      </AppText>
      {trailing ? (
        <AppText variant="caption" color="primary" weight="semibold">
          {trailing}
        </AppText>
      ) : null}
      <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color={theme.textTertiary} />
    </Pressable>
  );
}

export function AccountSummaryCard({
  accountName,
  accountIcon,
  accountType,
  accountSubtypeLabel,
  accountTypeVariant,
  accountColor,
  isParent,
  ancestorPath,
  onOpenAncestor,
  isDeleted,
  isArchived,
  subAccountCount,
  onShowSubAccounts,
  balanceAmount,
  secondaryBalances,
  transactionCountText,
  reconciledAtMs,
  currencyCode,
  onAuditPress,
  onReconcile,
  unreconciledCount,
}: AccountSummaryCardProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const { accentColor } = resolveAccountAppearance({ accountType, color: accountColor }, theme);
  const isCategory = isCategoryAccountType(accountType);
  const reconciledLabel =
    reconciledAtMs != null
      ? AppConfig.strings.accounts.reconciliation.reconciledLabel(
          formatRelativeReconciledDate(reconciledAtMs, resolvedHourCycle),
        )
      : null;

  const reconcileStatus =
    unreconciledCount > 0 && reconciledLabel
      ? {
          icon: Icon.CheckCircle,
          color: theme.warning,
          label: `${AppConfig.strings.accounts.entryCount(unreconciledCount)} since last match`,
          detail: reconciledLabel,
        }
      : reconciledLabel
        ? {
            icon: Icon.ShieldCheck,
            color: theme.success,
            label: reconciledLabel,
          }
        : {
            icon: Icon.CheckCircle,
            color: theme.textSecondary,
            label: 'Not matched yet',
            detail: 'Check it against your bank statement',
          };

  return (
    <View style={[styles.card, isArchived && styles.archivedCard]}>
      <View style={styles.header}>
        <IvyIcon
          name={accountIcon || undefined}
          fallbackIcon={getAccountFallbackIcon(accountType)}
          label={accountName}
          color={withOpacity(accentColor, Opacity.soft)}
          iconColor={getReadableColor(accentColor, theme.background)}
          size={Size.xl}
          shape={isParent ? 'square' : 'circle'}
        />
        <View style={styles.titleInfo}>
          <AccountParentPath ancestors={ancestorPath} onOpen={onOpenAncestor} />
          <AppText variant="xl" fontRole="display" numberOfLines={2}>
            {accountName}
          </AppText>
          <View style={styles.metaRow}>
            <Badge variant={accountTypeVariant} size="sm">
              {accountTypeLabel(accountType)}
            </Badge>
            {accountSubtypeLabel ? (
              <AppText variant="caption" color="secondary">
                {accountSubtypeLabel}
              </AppText>
            ) : null}
            {isDeleted ? <Badge variant="expense">DELETED</Badge> : null}
            {isArchived ? (
              <Badge variant="default" icon={Icon.Archive}>
                {AppConfig.strings.accounts.archive.archivedBadge}
              </Badge>
            ) : null}
          </View>
        </View>
        <IconButton
          name={Icon.History}
          onPress={onAuditPress}
          variant="clear"
          iconColor={theme.textSecondary}
          accessibilityLabel="View account history"
          testID="audit-button"
        />
      </View>

      <View style={[styles.balanceBlock, isCategory && styles.categoryBalance]}>
        <View style={styles.balanceLabel}>
          <AppText variant="caption" color="secondary">
            {accountDetailsCopy(accountType).balanceLabel}
          </AppText>
          {isCategory && (
            <AppText variant="caption" color="secondary">
              {transactionCountText}
            </AppText>
          )}
        </View>
        <View style={styles.amountLine}>
          <MoneyText
            amount={balanceAmount ?? 0}
            currencyCode={currencyCode}
            variant={isCategory ? 'body' : 'title'}
            weight="semibold"
            loading={balanceAmount === null}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={styles.balance}
            testID="account-balance"
          />
          {!isCategory && (
            <AppText variant="caption" color="secondary">
              {transactionCountText}
            </AppText>
          )}
        </View>
      </View>
      {secondaryBalances.length > 0 && (
        <View style={styles.secondaryBalances}>
          {secondaryBalances.map(balance => (
            <MoneyText
              key={balance.currencyCode}
              amount={balance.amount}
              currencyCode={balance.currencyCode}
              prefix="+ "
              variant="bodySmall"
              color="secondary"
            />
          ))}
        </View>
      )}

      {onReconcile || isParent ? (
        <View style={styles.summaryActions}>
          {onReconcile ? (
            <SummaryAction
              icon={reconcileStatus.icon}
              iconColor={reconcileStatus.color}
              label={reconcileStatus.label}
              trailing="Match"
              onPress={onReconcile}
              accessibilityLabel={[reconcileStatus.label, reconcileStatus.detail]
                .filter(Boolean)
                .join(', ')}
              accessibilityHint="Compare this account with your bank statement"
              testID="reconcile-button"
            />
          ) : null}
          {isParent ? (
            <SummaryAction
              icon={Icon.Hierarchy}
              iconColor={accentColor}
              label={`${subAccountCount} ${subAccountCount === 1 ? 'sub-account' : 'sub-accounts'}`}
              onPress={onShowSubAccounts}
              accessibilityLabel={`Show ${subAccountCount} ${subAccountCount === 1 ? 'sub-account' : 'sub-accounts'}`}
              testID="sub-accounts-button"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  archivedCard: {
    opacity: Opacity.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  titleInfo: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  balanceBlock: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  balanceLabel: {
    gap: Spacing.xs,
  },
  categoryBalance: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: 0,
  },
  secondaryBalances: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  amountLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.sm,
  },
  balance: {
    flexShrink: 1,
    maxWidth: '100%',
  },
  summaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  summaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.touchTarget,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.sm,
    maxWidth: '100%',
  },
  actionLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: Opacity.medium,
  },
});
