import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import {
  AuditAccountMap,
  asTransactionSnapshots,
  formatAuditAccountLabel,
  pairTransactionSnapshotLegs,
  resolveSnapshotCurrency,
  shouldHideUnchangedTransactionLeg,
} from '@/src/services/audit/auditLogDiffDisplay';
import { AuditChangeValue, AuditTransactionSnapshot } from '@/src/services/audit/auditLogTypes';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useTheme } from '@/src/hooks/use-theme';
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
  const formatMoney = useMoneyFormat();
  const oppositeMatched = new Set<number>();
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

        let oppIndex = oppositeSnapshots.findIndex(
          (opp, idx) =>
            !oppositeMatched.has(idx) &&
            opp.accountId === snapshot.accountId &&
            opp.type === snapshot.type,
        );
        if (oppIndex === -1) {
          oppIndex = oppositeSnapshots.findIndex(
            (opp, idx) => !oppositeMatched.has(idx) && opp.accountId === snapshot.accountId,
          );
        }
        if (oppIndex !== -1) oppositeMatched.add(oppIndex);
        const oppositeItem = oppIndex !== -1 ? oppositeSnapshots[oppIndex] : undefined;
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
                {formatMoney(snapshot.amount, itemCurrency || workplaceCurrency)} ({snapshot.type})
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
}

/** Before/after diff for the journal `transactions` audit field. */
export function AuditTransactionsFieldDiff({
  beforeVal,
  afterVal,
  accountMap,
  workplaceCurrency,
}: AuditTransactionsFieldDiffProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const beforeTxs = asTransactionSnapshots(beforeVal);
  const afterTxs = asTransactionSnapshots(afterVal);
  if (beforeTxs.length === 0 && afterTxs.length === 0) return null;

  const pairedLegs = pairTransactionSnapshotLegs(beforeTxs, afterTxs);

  return (
    <View style={{ marginTop: Spacing.xs }}>
      {pairedLegs.map(({ key, accountId, before: tBefore, after: tAfter }) => {
        if (shouldHideUnchangedTransactionLeg(tBefore, tAfter)) return null;

        const name = formatAuditAccountLabel(accountId, tAfter ?? tBefore, accountMap);
        const beforeCurrency = resolveSnapshotCurrency(
          tBefore,
          accountMap,
          accountId,
          tBefore?.currencyCode,
          workplaceCurrency,
        );
        const afterCurrency = resolveSnapshotCurrency(
          tAfter,
          accountMap,
          accountId,
          tAfter?.currencyCode,
          workplaceCurrency,
        );

        const beforeAmt = tBefore?.amount || 0;
        const afterAmt = tAfter?.amount || 0;
        const beforeType = tBefore?.type || '';
        const afterType = tAfter?.type || '';
        const typeChanged = beforeType !== afterType;

        return (
          <View key={key} style={{ marginBottom: Spacing.xs }}>
            <AppText variant="caption" color="secondary" weight="semibold">
              • {name}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginLeft: Spacing.md,
              }}
            >
              <AppText
                variant="caption"
                color="secondary"
                style={{ fontSize: Typography.sizes.xs, opacity: Opacity.medium, flexShrink: 1 }}
              >
                {formatMoney(beforeAmt, beforeCurrency)} ({beforeType})
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
                style={{ fontSize: Typography.sizes.xs, opacity: Opacity.heavy, flexShrink: 1 }}
              >
                {formatMoney(afterAmt, afterCurrency)} ({afterType})
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
