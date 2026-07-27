import { AppConfig } from '@/src/constants';
import {
  AuditChangeValue,
  AuditTransactionSnapshot,
  isTransactionSnapshot,
} from '@/src/features/audit/auditLogTypes';

export const AUDIT_ACCOUNT_ID_SHORT_LEN = 6;

export type AuditAccountMap = Record<string, { name: string; currency: string }>;

export function asTransactionSnapshots(
  value: AuditChangeValue | undefined,
): AuditTransactionSnapshot[] {
  if (!Array.isArray(value)) return [];
  const snapshots: AuditTransactionSnapshot[] = [];
  for (const item of value) {
    if (isTransactionSnapshot(item)) snapshots.push(item);
  }
  return snapshots;
}

export function formatAuditAccountLabel(
  accountId: string,
  snapshot: AuditTransactionSnapshot | undefined,
  accountMap: AuditAccountMap,
): string {
  const accountInfo = accountMap[accountId] || { name: '', currency: '' };
  return (
    snapshot?.accountName ||
    accountInfo.name ||
    `${AppConfig.strings.audit.accountPrefix}${accountId.substring(0, AUDIT_ACCOUNT_ID_SHORT_LEN)}`
  );
}

export function resolveSnapshotCurrency(
  snapshot: AuditTransactionSnapshot | undefined,
  accountMap: AuditAccountMap,
  accountId: string,
  fallbackCurrency?: string,
  workplaceCurrency?: string,
): string {
  const accountInfo = accountMap[accountId] || { name: '', currency: '' };
  return (
    snapshot?.currencyCode || accountInfo.currency || fallbackCurrency || workplaceCurrency || ''
  );
}

export function collectTransactionAccountIds(
  before: AuditTransactionSnapshot[],
  after: AuditTransactionSnapshot[],
): string[] {
  return Array.from(new Set([...before.map(t => t.accountId), ...after.map(t => t.accountId)]));
}

export function shouldHideUnchangedTransactionLeg(
  tBefore: AuditTransactionSnapshot | undefined,
  tAfter: AuditTransactionSnapshot | undefined,
): boolean {
  if (!tBefore || !tAfter) return false;
  const amountDiff = (tAfter.amount || 0) - (tBefore.amount || 0);
  const typeChanged = (tBefore.type || '') !== (tAfter.type || '');
  return amountDiff === 0 && !typeChanged;
}
