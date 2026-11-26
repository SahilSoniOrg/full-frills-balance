import { AppConfig } from '@/src/constants';
import {
  AuditChangeValue,
  AuditTransactionSnapshot,
  isTransactionSnapshot,
} from '@/src/services/audit/auditLogTypes';

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

export interface PairedTransactionLegDiff {
  key: string;
  accountId: string;
  before?: AuditTransactionSnapshot;
  after?: AuditTransactionSnapshot;
}

/** Pair transaction legs by account and type occurrence order without dropping split legs. */
export function pairTransactionSnapshotLegs(
  before: readonly AuditTransactionSnapshot[],
  after: readonly AuditTransactionSnapshot[],
): PairedTransactionLegDiff[] {
  const afterByExact = new Map<string, number[]>();
  after.forEach((leg, index) => {
    const exactKey = `${leg.accountId}:${leg.type || ''}`;
    const list = afterByExact.get(exactKey) ?? [];
    list.push(index);
    afterByExact.set(exactKey, list);
  });

  const usedAfter = new Set<number>();
  const pairedBeforeToAfter = new Map<number, number>();

  before.forEach((leg, beforeIdx) => {
    const exactKey = `${leg.accountId}:${leg.type || ''}`;
    const matchIndex = afterByExact.get(exactKey)?.shift();
    if (matchIndex !== undefined) {
      usedAfter.add(matchIndex);
      pairedBeforeToAfter.set(beforeIdx, matchIndex);
    }
  });

  const unmatchedAfterByAccount = new Map<string, number[]>();
  after.forEach((leg, index) => {
    if (usedAfter.has(index)) return;
    const list = unmatchedAfterByAccount.get(leg.accountId) ?? [];
    list.push(index);
    unmatchedAfterByAccount.set(leg.accountId, list);
  });

  const rows: PairedTransactionLegDiff[] = [];
  const emittedAfter = new Set<number>();
  before.forEach((leg, beforeIdx) => {
    let afterIdx = pairedBeforeToAfter.get(beforeIdx);
    if (afterIdx === undefined) {
      afterIdx = unmatchedAfterByAccount.get(leg.accountId)?.shift();
    }
    if (afterIdx !== undefined) emittedAfter.add(afterIdx);
    rows.push({
      key: `${leg.accountId}-b${beforeIdx}-a${afterIdx ?? 'none'}`,
      accountId: leg.accountId,
      before: leg,
      after: afterIdx !== undefined ? after[afterIdx] : undefined,
    });
  });

  after.forEach((leg, afterIdx) => {
    if (emittedAfter.has(afterIdx)) return;
    rows.push({
      key: `${leg.accountId}-bnone-a${afterIdx}`,
      accountId: leg.accountId,
      before: undefined,
      after: leg,
    });
  });

  return rows;
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
