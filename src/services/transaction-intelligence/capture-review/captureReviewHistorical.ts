import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { workplaceWriteCoordinator } from '@/src/services/preferences/WorkplaceWriteCoordinator';
import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  journalHistoricalCaptureQueries,
  type HistoricalCategoryPattern,
} from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import {
  categoryDefaultKey,
  type CaptureCategoryDefault,
} from '@/src/domain/transaction-intelligence/categoryDefaults';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';
import { CategoryDefaultConflictError } from './captureReviewTypes';

const HISTORICAL_SMS_BACKFILL_VERSION = 1;
const historicalBackfills = new Map<string, Promise<void>>();

export async function ensureHistoricalSmsBackfill(workplaceId: WorkplaceId): Promise<void> {
  if (
    preferences.workplace.getSnapshot(workplaceId).historicalSmsCaptureBackfillVersion ===
    HISTORICAL_SMS_BACKFILL_VERSION
  )
    return;
  const existing = historicalBackfills.get(workplaceId);
  if (existing) return existing;
  const pending = journalHistoricalCaptureQueries
    .backfillSmsEvidence(workplaceId)
    .then(() => {
      preferences.workplace.update(workplaceId, {
        historicalSmsCaptureBackfillVersion: HISTORICAL_SMS_BACKFILL_VERSION,
      });
    })
    .finally(() => historicalBackfills.delete(workplaceId));
  historicalBackfills.set(workplaceId, pending);
  return pending;
}

/** Load evidence using the current Uncategorized configuration. */
export async function listHistoricalPatternEvidenceEntries(
  workplaceId: WorkplaceId,
  pattern: HistoricalCategoryPattern,
  offset: number,
  limit: number,
) {
  const role = `${pattern.kind}:${pattern.currencyCode}`;
  const mappings =
    preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture
      ?.uncategorizedAccountIds ?? {};
  const roleAtStart = mappings[role];
  const entries = await journalHistoricalCaptureQueries.listPatternEvidenceEntries(
    workplaceId,
    pattern,
    offset,
    limit,
    mappings,
  );
  const current =
    preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture
      ?.uncategorizedAccountIds;
  return roleAtStart === current?.[role] ? entries : [];
}

/** Load one timeline window under the current workplace capture configuration. */
export async function listHistoricalPatternEvidenceWindow(
  workplaceId: WorkplaceId,
  pattern: HistoricalCategoryPattern,
  start: number,
  end: number,
) {
  const role = `${pattern.kind}:${pattern.currencyCode}`;
  const mappings =
    preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture
      ?.uncategorizedAccountIds ?? {};
  const roleAtStart = mappings[role];
  const entries = await journalHistoricalCaptureQueries.listPatternEvidenceWindow(
    workplaceId,
    pattern,
    start,
    end,
    mappings,
  );
  const current =
    preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture
      ?.uncategorizedAccountIds;
  return roleAtStart === current?.[role] ? entries : [];
}

/** A saved choice from the historical review is prospective and never edits old journals. */
export async function saveHistoricalCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  patternKey: string,
  approvedCategoryAccountId: AccountId,
): Promise<void> {
  await ensureHistoricalSmsBackfill(workplaceId);
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    const config = preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
    const pattern = (
      await journalHistoricalCaptureQueries.listCategoryPatterns(
        workplaceId,
        config?.uncategorizedAccountIds,
      )
    ).find(value => value.key === patternKey && value.categories.length === 1);
    if (!pattern || pattern.categories[0].accountId !== approvedCategoryAccountId)
      throw new Error('The historical category suggestion changed. Review it again.');
    const categoryAccountId = pattern.categories[0].accountId;
    const accounts = await accountQueryRepository.findAll(workplaceId);
    const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
    const uncategorizedId =
      config?.uncategorizedAccountIds[`${pattern.kind}:${pattern.currencyCode}`];
    if (
      !accountIndex.isFinancialLeaf(pattern.financialAccountId, pattern.currencyCode) ||
      !accountIndex.isCategoryLeaf(
        categoryAccountId,
        pattern.kind,
        pattern.currencyCode,
        uncategorizedId,
      )
    )
      throw new Error('The historical category or account is no longer available.');

    const choice: CaptureCategoryDefault = {
      merchant: pattern.merchant,
      financialAccountId: pattern.financialAccountId,
      kind: pattern.kind,
      currencyCode: pattern.currencyCode,
      categoryAccountId,
    };
    const current = preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? [];
    const key = categoryDefaultKey(choice);
    const existing = current.find(value => categoryDefaultKey(value) === key);
    if (
      existing &&
      (existing.categoryAccountId !== categoryAccountId ||
        existing.conflictingCategoryAccountIds?.length)
    ) {
      throw new CategoryDefaultConflictError();
    }
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: [
        ...current.filter(value => categoryDefaultKey(value) !== key),
        choice,
      ],
    });
  });
}
