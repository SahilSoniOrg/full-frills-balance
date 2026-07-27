import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import {
  AuditAccountMap,
  asTransactionSnapshots,
  collectTransactionAccountIds,
  formatAuditAccountLabel,
  resolveSnapshotCurrency,
  shouldHideUnchangedTransactionLeg,
} from '@/src/features/audit/auditLogDiffDisplay';
import { AuditChangeValue, AuditTransactionSnapshot } from '@/src/features/audit/auditLogTypes';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { View } from 'react-native';

interface AuditTransactionSnapshotStackProps {
  snapshots: AuditTransactionSnapshot[];
  oppositeSnapshots?: AuditTransactionSnapshot[];
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
  currencyCode?: string;
  isAfter?: boolean;
}

/** Renders a list of transaction snapshots (single side of a diff or a flat create payload). */
export function AuditTransactionSnapshotStack({
  snapshots,
  oppositeSnapshots = [],
  accountMap,
  workplaceCurrency,
  currencyCode,
  isAfter = false,
}: AuditTransactionSnapshotStackProps) {
  return (
    <View style={{ marginTop: Spacing.xs }}>
      {snapshots.map((snapshot, index) => {
        const accountName = formatAuditAccountLabel(snapshot.accountId, snapshot, accountMap);
        const itemCurrency = resolveSnapshotCurrency(
          snapshot,
          accountMap,
          snapshot.accountId,
          currencyCode,
          workplaceCurrency,
        );

        const oppositeItem = oppositeSnapshots.find(opp => opp.accountId === snapshot.accountId);
        const oppositeName = oppositeItem
          ? formatAuditAccountLabel(oppositeItem.accountId, oppositeItem, accountMap)
          : null;

        const nameChanged = !oppositeItem || oppositeName !== accountName;
        const shouldShowName = !isAfter || nameChanged;

        return (
          <View key={`${snapshot.accountId}-${index}`} style={{ marginBottom: Spacing.xs }}>
            {shouldShowName && (
              <AppText variant="caption" color="secondary" weight="semibold">
                • {accountName}
              </AppText>
            )}
            <View style={shouldShowName ? { marginLeft: Spacing.md } : {}}>
              <AppText variant="caption" color="secondary">
                {CurrencyFormatter.format(snapshot.amount, itemCurrency || workplaceCurrency)} (
                {snapshot.type})
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface AuditTransactionsFieldDiffProps {
  beforeVal: AuditChangeValue | undefined;
  afterVal: AuditChangeValue | undefined;
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
  theme: Theme;
}

/** Before/after diff for the journal `transactions` audit field. */
export function AuditTransactionsFieldDiff({
  beforeVal,
  afterVal,
  accountMap,
  workplaceCurrency,
  theme,
}: AuditTransactionsFieldDiffProps) {
  const beforeTxs = asTransactionSnapshots(beforeVal);
  const afterTxs = asTransactionSnapshots(afterVal);
  if (beforeTxs.length === 0 && afterTxs.length === 0) return null;

  const accountIds = collectTransactionAccountIds(beforeTxs, afterTxs);

  return (
    <View style={{ marginTop: Spacing.xs }}>
      {accountIds.map(accountId => {
        const tBefore = beforeTxs.find(t => t.accountId === accountId);
        const tAfter = afterTxs.find(t => t.accountId === accountId);

        if (shouldHideUnchangedTransactionLeg(tBefore, tAfter)) return null;

        const name = formatAuditAccountLabel(accountId, tAfter ?? tBefore, accountMap);
        const currency = resolveSnapshotCurrency(
          tAfter ?? tBefore,
          accountMap,
          accountId,
          tAfter?.currencyCode || tBefore?.currencyCode,
          workplaceCurrency,
        );

        const beforeAmt = tBefore?.amount || 0;
        const afterAmt = tAfter?.amount || 0;
        const beforeType = tBefore?.type || '';
        const afterType = tAfter?.type || '';
        const typeChanged = beforeType !== afterType;

        return (
          <View key={accountId} style={{ marginBottom: Spacing.xs }}>
            <AppText variant="caption" color="secondary" weight="semibold">
              • {name}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginLeft: Spacing.md,
              }}
            >
              <AppText
                variant="caption"
                color="secondary"
                style={{ fontSize: Typography.sizes.xs, opacity: Opacity.medium }}
              >
                {CurrencyFormatter.format(beforeAmt, currency)} ({beforeType})
              </AppText>
              <AppText
                variant="caption"
                style={{
                  marginHorizontal: Spacing.sm,
                  fontSize: Typography.sizes.xs,
                }}
              >
                →
              </AppText>
              <AppText
                variant="caption"
                color="secondary"
                style={{ fontSize: Typography.sizes.xs, opacity: Opacity.heavy }}
              >
                {CurrencyFormatter.format(afterAmt, currency)} ({afterType})
              </AppText>
              {typeChanged && (
                <AppText
                  variant="caption"
                  style={{
                    color: theme.transfer,
                    fontSize: Typography.sizes.xs,
                    marginLeft: Spacing.xs,
                  }}
                >
                  {AppConfig.strings.audit.typeChanged}
                </AppText>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
