import { MoneyText } from '@/src/components/shared/MoneyText';
import {
  Icon,
  AppIcon,
  AppButton,
  AppText,
  Badge,
  IconButton,
  IvyIcon,
  ListGroup,
  ListRow,
  type IconName,
} from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { AccountParentPath } from '@/src/features/accounts/components/AccountParentPath';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import type { AccountSummaryCardModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import { isCategoryAccountType, resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getReadableColor, withOpacity } from '@/src/utils/color-math';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

// Old minimumFontScale was 0.6; same floor, now honoured on web too.
const TITLE_BALANCE_FIT = {
  maxFontSize: Typography.roles.title.fontSize,
  minFontSize: Math.round(Typography.roles.title.fontSize * 0.6),
  lineHeightRatio: Typography.roles.title.lineHeight / Typography.roles.title.fontSize,
  hug: true,
};
const BODY_BALANCE_FIT = {
  maxFontSize: Typography.roles.body.fontSize,
  minFontSize: Typography.sizes.xs,
  lineHeightRatio: Typography.roles.body.lineHeight / Typography.roles.body.fontSize,
  hug: true,
};

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
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  return (
    <ListRow
      leading={
        <AppIcon
          name={icon}
          size={Size.iconSm}
          color={getReadableColor(iconColor, theme.background)}
        />
      }
      title={label}
      chevron
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
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
}: AccountSummaryCardProps) {
  const { theme } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const { accentColor } = resolveAccountAppearance({ accountType, color: accountColor }, theme);
  const isCategory = isCategoryAccountType(accountType);
  const reconciliationCopy = AppConfig.strings.accounts.reconciliation;
  const verifiedDate =
    reconciledAtMs != null ? formatRelativeReconciledDate(reconciledAtMs, resolvedHourCycle) : null;
  const reconciledLabel =
    verifiedDate != null ? reconciliationCopy.reconciledLabel(verifiedDate) : null;
  const verificationLabel = reconciledLabel ?? reconciliationCopy.notVerifiedLabel;

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
          <View style={styles.metaRow}>
            <Badge variant={accountTypeVariant} size="sm">
              {accountSubtypeLabel || accountTypeLabel(accountType)}
            </Badge>
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
            fit={isCategory ? BODY_BALANCE_FIT : TITLE_BALANCE_FIT}
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

      {onReconcile ? (
        <View
          style={[
            styles.reconciliation,
            { backgroundColor: theme.surface },
            width / fontScale < 320 && styles.reconciliationStacked,
          ]}
        >
          <View
            accessible
            accessibilityLabel={`${verificationLabel}, ${reconciliationCopy.verifyHint}`}
            style={styles.reconciliationStatus}
          >
            <AppIcon
              name={Icon.Scale}
              size={Size.iconSm}
              color={getReadableColor(theme.textSecondary, theme.surface)}
            />
            <View style={styles.reconciliationCopy}>
              <AppText
                variant={verifiedDate != null ? 'caption' : 'bodySmall'}
                color={verifiedDate != null ? 'secondary' : 'text'}
                weight={verifiedDate != null ? 'regular' : 'medium'}
              >
                {verifiedDate != null
                  ? reconciliationCopy.verifiedThroughLabel
                  : reconciliationCopy.notVerifiedLabel}
              </AppText>
              <AppText
                variant={verifiedDate != null ? 'bodySmall' : 'caption'}
                color={verifiedDate != null ? 'text' : 'secondary'}
                weight={verifiedDate != null ? 'medium' : 'regular'}
              >
                {verifiedDate ?? reconciliationCopy.verifyHint}
              </AppText>
            </View>
          </View>
          <AppButton
            variant="outline"
            size="sm"
            style={styles.reconciliationButton}
            buttonStyle={[
              styles.reconciliationButtonSurface,
              { backgroundColor: theme.primaryLight, borderColor: theme.primaryLight },
            ]}
            onPress={onReconcile}
            disabled={balanceAmount === null}
            accessibilityLabel={reconciliationCopy.verifyAction}
            accessibilityHint={reconciliationCopy.verifyHint}
            testID="reconcile-button"
          >
            {reconciliationCopy.verifyAction}
          </AppButton>
        </View>
      ) : null}

      {isParent ? (
        <View style={styles.summaryActions}>
          <ListGroup variant="plain">
            <SummaryAction
              icon={Icon.Hierarchy}
              iconColor={accentColor}
              label={`${subAccountCount} ${subAccountCount === 1 ? 'sub-account' : 'sub-accounts'}`}
              onPress={onShowSubAccounts}
              accessibilityLabel={`Show ${subAccountCount} ${subAccountCount === 1 ? 'sub-account' : 'sub-accounts'}`}
              testID="sub-accounts-button"
            />
          </ListGroup>
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
  reconciliation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
  },
  reconciliationStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  reconciliationStatus: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  reconciliationCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  reconciliationButton: {
    flexShrink: 0,
  },
  reconciliationButtonSurface: {
    minHeight: Size.buttonMd,
    borderRadius: Shape.radius.md,
    paddingHorizontal: Spacing.md,
  },
  // ponytail: rows bring their own padding; pull them back to the card edge.
  summaryActions: {
    marginHorizontal: Spacing.xs - Spacing.md,
  },
});
