import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { workplaceWriteCoordinator } from '@/src/services/preferences/WorkplaceWriteCoordinator';
import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  categoryDefaultKey,
  type CaptureCategoryDefault,
} from '@/src/domain/transaction-intelligence/categoryDefaults';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';
import { captureItems } from './captureReviewItems';
import { CategoryDefaultConflictError } from './captureReviewTypes';

export function listCaptureDescriptionDefaults(workplaceId: WorkplaceId) {
  const snapshot = preferences.workplace.getSnapshot(workplaceId);
  const open = new Set(snapshot.openCaptureMerchants ?? []);
  return Object.entries(snapshot.captureDescriptionDefaults ?? {}).map(([key, description]) => {
    let parts: unknown;
    try {
      parts = JSON.parse(key);
    } catch {
      parts = null;
    }
    const merchant = Array.isArray(parts) && typeof parts[0] === 'string' ? parts[0] : undefined;
    const amount = Array.isArray(parts) && typeof parts[1] === 'number' ? parts[1] : undefined;
    const currencyCode =
      Array.isArray(parts) && typeof parts[2] === 'string' ? parts[2] : undefined;
    const kind =
      Array.isArray(parts) &&
      (parts[3] === 'expense' || parts[3] === 'income' || parts[3] === 'transfer')
        ? parts[3]
        : undefined;
    return {
      key,
      description,
      merchant,
      amount,
      currencyCode,
      kind,
      paused: !!merchant && open.has(merchant),
    };
  });
}

/** Workplace-scoped merchant-wide review pauses, including merchants without a saved rule. */
export function listOpenCaptureMerchants(workplaceId: WorkplaceId): string[] {
  return [
    ...new Set(preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants ?? []),
  ].sort((left, right) => left.localeCompare(right));
}

export async function listCaptureCategoryDefaults(workplaceId: WorkplaceId) {
  const accounts = await accountQueryRepository.findAll(workplaceId);
  const snapshot = preferences.workplace.getSnapshot(workplaceId);
  const config = snapshot.automaticTransactionCapture;
  const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
  const open = new Set(snapshot.openCaptureMerchants ?? []);
  return (snapshot.captureCategoryDefaults ?? []).map(value => {
    const choices = [value.categoryAccountId, ...(value.conflictingCategoryAccountIds ?? [])];
    const categoryChoices = choices.map(accountId => ({
      accountId,
      name: accountIndex.byId.get(accountId)?.name ?? 'Unavailable category',
      available: accountIndex.isCategoryLeaf(
        accountId,
        value.kind,
        value.currencyCode,
        config?.uncategorizedAccountIds[`${value.kind}:${value.currencyCode}`],
      ),
    }));
    return {
      ...value,
      key: categoryDefaultKey(value),
      financialAccountName:
        accountIndex.byId.get(value.financialAccountId)?.name ?? 'Unavailable account',
      categoryName: categoryChoices[0]?.name ?? 'Unavailable category',
      categoryChoices,
      conflicted: choices.length > 1,
      paused: open.has(value.merchant),
      available:
        accountIndex.isFinancialLeaf(value.financialAccountId, value.currencyCode) &&
        categoryChoices.some(choice => choice.available),
    };
  });
}

/** Recheck the candidate and account context after the user accepts the prompt. */
export async function saveCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  journalId: JournalId,
  choice: CaptureCategoryDefault,
): Promise<void> {
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    if (choice.merchant.length > 200) {
      throw new Error('This merchant name is too long to save as a category default.');
    }
    const item = (await captureItems(workplaceId)).find(row => row.journalId === journalId);
    if (
      !item?.suggestedDefault ||
      categoryDefaultKey(item.suggestedDefault) !== categoryDefaultKey(choice) ||
      item.suggestedDefault.categoryAccountId !== choice.categoryAccountId
    )
      throw new Error('The suggested category changed. Review this entry again.');
    const snapshot = preferences.workplace.getSnapshot(workplaceId);
    if (
      snapshot.automaticTransactionCapture?.uncategorizedAccountIds[
        `${choice.kind}:${choice.currencyCode}`
      ] === choice.categoryAccountId
    )
      throw new Error('Uncategorized cannot be saved as a category default.');
    const current = snapshot.captureCategoryDefaults ?? [];
    const key = categoryDefaultKey(choice);
    const existing = current.find(value => categoryDefaultKey(value) === key);
    if (
      existing &&
      (existing.categoryAccountId !== choice.categoryAccountId ||
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

export async function removeCaptureCategoryDefault(
  workplaceId: WorkplaceId,
  key: string,
): Promise<void> {
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    const current = preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? [];
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: current.filter(value => categoryDefaultKey(value) !== key),
    });
  });
}

/** Resolve an account-merge collision by explicitly selecting one preserved category. */
export async function resolveCaptureCategoryDefaultConflict(
  workplaceId: WorkplaceId,
  key: string,
  categoryAccountId: AccountId,
): Promise<void> {
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    const snapshot = preferences.workplace.getSnapshot(workplaceId);
    const current = snapshot.captureCategoryDefaults ?? [];
    const conflicted = current.find(value => categoryDefaultKey(value) === key);
    const choices = conflicted
      ? [conflicted.categoryAccountId, ...(conflicted.conflictingCategoryAccountIds ?? [])]
      : [];
    if (!conflicted || choices.length < 2 || !choices.includes(categoryAccountId))
      throw new Error('This category default is no longer conflicted. Review it again.');
    const accounts = await accountQueryRepository.findAll(workplaceId);
    const config = snapshot.automaticTransactionCapture;
    const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
    if (
      !accountIndex.isFinancialLeaf(conflicted.financialAccountId, conflicted.currencyCode) ||
      !accountIndex.isCategoryLeaf(
        categoryAccountId,
        conflicted.kind,
        conflicted.currencyCode,
        config?.uncategorizedAccountIds[`${conflicted.kind}:${conflicted.currencyCode}`],
      )
    )
      throw new Error('The selected account is no longer available. Review this default again.');
    preferences.workplace.update(workplaceId, {
      captureCategoryDefaults: [
        ...current.filter(value => categoryDefaultKey(value) !== key),
        { ...conflicted, categoryAccountId, conflictingCategoryAccountIds: undefined },
      ],
    });
  });
}

export async function setCaptureDescriptionDefault(
  workplaceId: WorkplaceId,
  key: string,
  description?: string,
): Promise<void> {
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    const defaults = {
      ...preferences.workplace.getSnapshot(workplaceId).captureDescriptionDefaults,
    };
    if (description?.trim()) defaults[key] = description.trim().slice(0, 200);
    else delete defaults[key];
    preferences.workplace.update(workplaceId, { captureDescriptionDefaults: defaults });
  });
}

export async function setCaptureMerchantsOpen(
  workplaceId: WorkplaceId,
  merchantsToChange: readonly string[],
  open: boolean,
): Promise<void> {
  const keys = [
    ...new Set(merchantsToChange.map(merchant => merchant.trim().toLowerCase())),
  ].filter(Boolean);
  if (keys.length === 0) return;
  await workplaceWriteCoordinator.run(workplaceId, async () => {
    const merchants = new Set(
      preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants ?? [],
    );
    for (const key of keys) {
      if (open) merchants.add(key);
      else merchants.delete(key);
    }
    preferences.workplace.update(workplaceId, { openCaptureMerchants: [...merchants] });
  });
}

export async function setCaptureMerchantOpen(
  workplaceId: WorkplaceId,
  merchant: string,
  open: boolean,
): Promise<void> {
  return setCaptureMerchantsOpen(workplaceId, [merchant], open);
}
