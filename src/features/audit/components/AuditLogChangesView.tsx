import { Icon, AppIcon, AppText } from '@/src/components/core';
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
  getAuditDetails,
  getAuditFieldDiff,
  getChangeField,
  hasBeforeAfterChanges,
  isAuditChangeRecord,
} from '@/src/features/audit/auditLogTypes';
import { isAuditEventPayload } from '@/src/types/auditEvents';
import { useTheme } from '@/src/hooks/use-theme';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import type { ResolvedHourCycle } from '@/src/utils/hourCycle';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const FINANCIAL_KEYS = ['amount', 'totalAmount', 'totalDebits', 'totalCredits'] as const;
const TRANSACTIONS_KEY = 'transactions';
const CURRENCY_CODE_KEY = 'currencyCode';
const STRUCTURED_JSON_FIELDS = new Set(['actionsJson', 'channelsJson', 'conditionsJson']);
const DATE_FIELDS = new Set([
  'archivedAt',
  'createdAt',
  'deletedAt',
  'effectiveDate',
  'endDate',
  'firstSeenAt',
  'inputDate',
  'journalDate',
  'lastScannedAt',
  'nextOccurrence',
  'processedAt',
  'reconciledAt',
  'startDate',
  'transactionDate',
  'updatedAt',
]);

interface AuditLogChangesViewProps {
  changes: ParsedChanges;
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
}

type AuditLogChangesRenderProps = AuditLogChangesViewProps & {
  hourCycle: ResolvedHourCycle;
};

function formatAuditFieldLabel(field: string): string {
  const explicitLabel = AppConfig.strings.audit.fieldLabels[field];
  if (explicitLabel) return explicitLabel;

  const words = field
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words
    .replace(/\bId\b/g, 'ID')
    .replace(/\bIds\b/g, 'IDs')
    .replace(/^\w/, character => character.toUpperCase());
}

function formatAuditDate(
  value: AuditChangeValue,
  hourCycle: ResolvedHourCycle,
): string | undefined {
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? undefined
    : formatDate(date, { includeTime: true, hourCycle });
}

function accountReferenceLabel(id: string, accountMap: AuditAccountMap): string {
  return accountMap[id]?.name || `${AppConfig.strings.audit.accountPrefix}${id.slice(0, 8)}`;
}

function renderScalarValue(value: AuditChangeValue | undefined): string {
  if (value === null || value === undefined) return AppConfig.strings.audit.notSet;
  if (typeof value === 'object') return '[Object]';
  return String(value);
}

function parseStructuredJsonField(
  field: string,
  value: AuditChangeValue | undefined,
): AuditChangeValue | undefined {
  if (typeof value !== 'string' || !STRUCTURED_JSON_FIELDS.has(field)) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isAuditChangeRecord(parsed) || Array.isArray(parsed)
      ? (parsed as AuditChangeValue)
      : undefined;
  } catch {
    return undefined;
  }
}

interface ChangeValueRendererProps {
  theme: Theme;
  accountMap: AuditAccountMap;
  workplaceCurrency: string;
  changeKey: string;
  value: AuditChangeValue | undefined;
  hourCycle: ResolvedHourCycle;
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
  hourCycle,
  currencyCode,
  isAfter = false,
  oppositeValue,
}: ChangeValueRendererProps): React.ReactNode {
  if (value === null || value === undefined) {
    return <AppText variant="caption">{AppConfig.strings.audit.notSet}</AppText>;
  }

  const structuredValue = parseStructuredJsonField(changeKey, value);
  if (structuredValue !== undefined) {
    return (
      <ChangeValueRenderer
        theme={theme}
        accountMap={accountMap}
        workplaceCurrency={workplaceCurrency}
        changeKey={changeKey}
        value={structuredValue}
        oppositeValue={parseStructuredJsonField(changeKey, oppositeValue)}
        hourCycle={hourCycle}
        currencyCode={currencyCode}
        isAfter={isAfter}
      />
    );
  }

  if (DATE_FIELDS.has(changeKey)) {
    const formattedDate = formatAuditDate(value, hourCycle);
    if (formattedDate) {
      return (
        <AppText variant="caption" color="secondary">
          {formattedDate}
        </AppText>
      );
    }
  }

  if (
    typeof value === 'string' &&
    changeKey.toLowerCase().endsWith('accountid') &&
    accountMap[value]
  ) {
    return (
      <AppText variant="caption" color="secondary">
        {accountMap[value].name}
      </AppText>
    );
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

    if (
      changeKey.toLowerCase().endsWith('accountids') &&
      value.every(item => typeof item === 'string')
    ) {
      return (
        <View style={{ marginTop: Spacing.xs }}>
          {value.map(id => (
            <AppText key={id} variant="caption" color="secondary">
              • {accountReferenceLabel(id, accountMap)}
            </AppText>
          ))}
        </View>
      );
    }

    return (
      <View style={{ marginTop: Spacing.xs }}>
        {value.map((val, index) =>
          isAuditChangeRecord(val) || Array.isArray(val) ? (
            <ChangeValueRenderer
              key={index}
              theme={theme}
              accountMap={accountMap}
              workplaceCurrency={workplaceCurrency}
              changeKey={changeKey}
              value={val}
              hourCycle={hourCycle}
              currencyCode={currencyCode}
              isAfter={isAfter}
            />
          ) : (
            <View key={index} style={{ marginBottom: Spacing.xs }}>
              <AppText variant="caption" color="secondary">
                • {renderScalarValue(val)}
              </AppText>
            </View>
          ),
        )}
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
        {Object.entries(value).length === 0 ? (
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.audit.noDetails}
          </AppText>
        ) : (
          Object.entries(value).map(([key, nestedValue]) => (
            <View key={key} style={{ marginBottom: Spacing.xs }}>
              <AppText variant="caption" weight="semibold">
                {formatAuditFieldLabel(key)}
              </AppText>
              <ChangeValueRenderer
                theme={theme}
                accountMap={accountMap}
                workplaceCurrency={workplaceCurrency}
                changeKey={key}
                value={nestedValue}
                hourCycle={hourCycle}
                currencyCode={currencyCode}
                isAfter={isAfter}
              />
            </View>
          ))
        )}
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
  hourCycle,
  theme,
}: AuditLogChangesRenderProps & { theme: Theme }) {
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
                  {formatAuditFieldLabel(key)}:
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
              {formatAuditFieldLabel(key)}:
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
                  hourCycle={hourCycle}
                  currencyCode={beforeCurrencyCode}
                  isAfter={false}
                  oppositeValue={afterVal}
                />
              </View>
              <View style={{ justifyContent: 'center', paddingTop: Spacing.xs }}>
                <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <ChangeValueRenderer
                  theme={theme}
                  accountMap={accountMap}
                  workplaceCurrency={workplaceCurrency}
                  changeKey={key}
                  value={afterVal}
                  hourCycle={hourCycle}
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
  hourCycle,
  theme,
}: AuditLogChangesRenderProps & { theme: Theme }) {
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
            {formatAuditFieldLabel(key)}:{' '}
          </AppText>
          <ChangeValueRenderer
            theme={theme}
            accountMap={accountMap}
            workplaceCurrency={workplaceCurrency}
            changeKey={key}
            value={value}
            hourCycle={hourCycle}
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
  const { resolvedHourCycle } = useHourCyclePrefs();
  const fieldDiff = getAuditFieldDiff(changes);
  const details = isAuditEventPayload(changes) ? getAuditDetails(changes) : undefined;
  const hasDetails = !!details && Object.keys(details).length > 0;

  if (fieldDiff) {
    return (
      <View>
        <BeforeAfterChangesView
          changes={fieldDiff}
          accountMap={accountMap}
          workplaceCurrency={workplaceCurrency}
          hourCycle={resolvedHourCycle}
          theme={theme}
        />
        {hasDetails && (
          <FlatChangesView
            changes={details}
            accountMap={accountMap}
            workplaceCurrency={workplaceCurrency}
            hourCycle={resolvedHourCycle}
            theme={theme}
          />
        )}
      </View>
    );
  }

  if (isAuditEventPayload(changes) && !hasDetails) return null;

  return (
    <FlatChangesView
      changes={getAuditDetails(changes)}
      accountMap={accountMap}
      workplaceCurrency={workplaceCurrency}
      hourCycle={resolvedHourCycle}
      theme={theme}
    />
  );
}
