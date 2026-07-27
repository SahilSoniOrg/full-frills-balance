import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { AuditAccountMap, asTransactionSnapshots } from '@/src/features/audit/auditLogDiffDisplay';
import {
  AuditTransactionsFieldDiff,
  AuditTransactionSnapshotStack,
} from '@/src/features/audit/components/AuditTransactionDiff';
import {
  AuditChangeRecord,
  AuditChangeValue,
  ParsedChanges,
  getChangeField,
  hasBeforeAfterChanges,
  isAuditChangeRecord,
} from '@/src/features/audit/auditLogTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const FINANCIAL_KEYS = ['amount', 'totalAmount', 'totalDebits', 'totalCredits'] as const;
const TRANSACTIONS_KEY = 'transactions';
const CURRENCY_CODE_KEY = 'currencyCode';

interface AuditLogChangesViewProps {
  changes: ParsedChanges;
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
}

function renderScalarValue(value: AuditChangeValue | undefined): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return '[Object]';
  return String(value);
}

interface ChangeValueRendererProps {
  theme: Theme;
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
  changeKey: string;
  value: AuditChangeValue | undefined;
  currencyCode?: string;
  isAfter?: boolean;
  oppositeValue?: AuditChangeValue | undefined;
}

function ChangeValueRenderer({
  theme,
  accountMap,
  workplaceCurrency,
  changeKey,
  value,
  currencyCode,
  isAfter = false,
  oppositeValue,
}: ChangeValueRendererProps): React.ReactNode {
  if (value === null || value === undefined) {
    return <AppText variant="caption">null</AppText>;
  }

  if (
    FINANCIAL_KEYS.includes(changeKey as (typeof FINANCIAL_KEYS)[number]) &&
    typeof value === 'number'
  ) {
    return (
      <AppText variant="caption" color="secondary">
        {CurrencyFormatter.format(value, currencyCode || workplaceCurrency)}
      </AppText>
    );
  }

  if (Array.isArray(value)) {
    const snapshots = asTransactionSnapshots(value);
    const oppositeSnapshots = asTransactionSnapshots(oppositeValue);
    if (snapshots.length > 0) {
      return (
        <AuditTransactionSnapshotStack
          snapshots={snapshots}
          oppositeSnapshots={oppositeSnapshots}
          accountMap={accountMap}
          workplaceCurrency={workplaceCurrency}
          currencyCode={currencyCode}
          isAfter={isAfter}
        />
      );
    }

    return (
      <View style={{ marginTop: Spacing.xs }}>
        {value.map((val, index) => (
          <View key={index} style={{ marginBottom: Spacing.xs }}>
            <AppText variant="caption" color="secondary">
              • {JSON.stringify(val)}
            </AppText>
          </View>
        ))}
      </View>
    );
  }

  if (isAuditChangeRecord(value)) {
    return (
      <View
        style={{
          padding: Spacing.xs,
          borderRadius: Shape.radius.sm,
          backgroundColor: theme.surfaceSecondary,
        }}
      >
        {Object.entries(value).map(([k, v]) => (
          <AppText key={k} variant="caption" color="secondary">
            {k}: {typeof v === 'object' && v !== null ? '[Object]' : renderScalarValue(v)}
          </AppText>
        ))}
      </View>
    );
  }

  return (
    <AppText variant="caption" color="secondary">
      {renderScalarValue(value)}
    </AppText>
  );
}

function BeforeAfterChangesView({
  changes,
  accountMap,
  workplaceCurrency,
  theme,
}: AuditLogChangesViewProps & { theme: Theme }) {
  if (!hasBeforeAfterChanges(changes)) return null;

  const { before, after } = changes;
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const beforeCurrency = getChangeField(before, CURRENCY_CODE_KEY);
  const afterCurrency = getChangeField(after, CURRENCY_CODE_KEY);
  const beforeCurrencyCode = typeof beforeCurrency === 'string' ? beforeCurrency : undefined;
  const afterCurrencyCode = typeof afterCurrency === 'string' ? afterCurrency : undefined;

  return (
    <View
      style={{
        marginTop: Spacing.md,
        padding: Spacing.sm,
        borderRadius: Shape.radius.sm,
        backgroundColor: theme.surfaceSecondary,
      }}
    >
      {allKeys.map(key => {
        const beforeVal = getChangeField(before, key);
        const afterVal = getChangeField(after, key);
        const isChanged = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);

        if (!isChanged && key !== TRANSACTIONS_KEY) return null;
        if (key === CURRENCY_CODE_KEY) return null;

        const isFinancial = FINANCIAL_KEYS.includes(key as (typeof FINANCIAL_KEYS)[number]);
        if (isFinancial) {
          const bNum = typeof beforeVal === 'number' ? beforeVal : parseFloat(String(beforeVal));
          const aNum = typeof afterVal === 'number' ? afterVal : parseFloat(String(afterVal));

          if (!isNaN(bNum) && !isNaN(aNum)) {
            const diff = aNum - bNum;
            const currency = afterCurrencyCode || beforeCurrencyCode || workplaceCurrency;
            const color = diff > 0 ? theme.success : diff < 0 ? theme.error : theme.textSecondary;
            const diffPrefix = diff > 0 ? '+' : '';

            return (
              <View
                key={key}
                style={{
                  marginBottom: Spacing.sm,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.divider,
                }}
              >
                <AppText variant="caption" weight="bold">
                  {key}:
                </AppText>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: Spacing.xs,
                  }}
                >
                  <AppText variant="caption" color="secondary">
                    {CurrencyFormatter.format(bNum, currency)}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ marginHorizontal: Spacing.sm, opacity: Opacity.soft }}
                  >
                    :
                  </AppText>
                  <AppText variant="caption" style={{ color, fontWeight: 'bold' }}>
                    {diffPrefix}
                    {CurrencyFormatter.format(diff, currency)}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ marginHorizontal: Spacing.sm, opacity: Opacity.soft }}
                  >
                    :
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {CurrencyFormatter.format(aNum, currency)}
                  </AppText>
                </View>
              </View>
            );
          }
        }

        if (key === TRANSACTIONS_KEY) {
          return (
            <View
              key={key}
              style={{
                marginBottom: Spacing.sm,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.divider,
              }}
            >
              <AppText variant="caption" weight="bold">
                {AppConfig.strings.audit.transactionsLabel}
              </AppText>
              <AuditTransactionsFieldDiff
                beforeVal={beforeVal}
                afterVal={afterVal}
                accountMap={accountMap}
                workplaceCurrency={workplaceCurrency}
                theme={theme}
              />
            </View>
          );
        }

        return (
          <View
            key={key}
            style={{
              marginBottom: Spacing.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.divider,
            }}
          >
            <AppText variant="caption" weight="bold">
              {key}:
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                marginTop: Spacing.xs,
                gap: Spacing.sm,
              }}
            >
              <View style={{ flex: 1, opacity: Opacity.medium }}>
                <ChangeValueRenderer
                  theme={theme}
                  accountMap={accountMap}
                  workplaceCurrency={workplaceCurrency}
                  changeKey={key}
                  value={beforeVal}
                  currencyCode={beforeCurrencyCode}
                  isAfter={false}
                  oppositeValue={afterVal}
                />
              </View>
              <View style={{ justifyContent: 'center', paddingTop: Spacing.xs }}>
                <AppIcon name="arrowRight" size={Size.xxs} color={theme.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <ChangeValueRenderer
                  theme={theme}
                  accountMap={accountMap}
                  workplaceCurrency={workplaceCurrency}
                  changeKey={key}
                  value={afterVal}
                  currencyCode={afterCurrencyCode}
                  isAfter
                  oppositeValue={beforeVal}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FlatChangesView({
  changes,
  accountMap,
  workplaceCurrency,
  theme,
}: AuditLogChangesViewProps & { theme: Theme }) {
  const record = changes as AuditChangeRecord;
  return (
    <View
      style={{
        marginTop: Spacing.md,
        padding: Spacing.sm,
        borderRadius: Shape.radius.sm,
        backgroundColor: theme.surfaceSecondary,
      }}
    >
      {Object.entries(record).map(([key, value]) => (
        <View
          key={key}
          style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.xs }}
        >
          <AppText variant="caption" weight="bold">
            {key}:{' '}
          </AppText>
          <ChangeValueRenderer
            theme={theme}
            accountMap={accountMap}
            workplaceCurrency={workplaceCurrency}
            changeKey={key}
            value={value}
            currencyCode={workplaceCurrency}
          />
        </View>
      ))}
    </View>
  );
}

export function AuditLogChangesView({
  changes,
  accountMap,
  workplaceCurrency,
}: AuditLogChangesViewProps) {
  const { theme } = useTheme();

  if (hasBeforeAfterChanges(changes)) {
    return (
      <BeforeAfterChangesView
        changes={changes}
        accountMap={accountMap}
        workplaceCurrency={workplaceCurrency}
        theme={theme}
      />
    );
  }

  return (
    <FlatChangesView
      changes={changes}
      accountMap={accountMap}
      workplaceCurrency={workplaceCurrency}
      theme={theme}
    />
  );
}
