import { accountQueryRepository } from '@/src/data/repositories/account';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { preferences } from '@/src/services/preferences';
import type { AccountMatcherContext } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { categoryDefaultKey } from '@/src/domain/transaction-intelligence/categoryDefaults';
import { createCaptureAccountIndex } from '@/src/domain/transaction-intelligence/captureAccountEligibility';

export interface CaptureContext {
  matchers: AccountMatcherContext;
  sourceAccountCurrency: (accountId: AccountId) => string | undefined;
  isFinancialLeaf: (accountId: AccountId) => boolean;
  captureEnabled?: boolean;
  captureEnabledAt?: number;
  uncategorizedAccount: (kind: 'expense' | 'income', currencyCode: string) => AccountId | undefined;
  categoryDefault?: (
    merchant: string,
    financialAccountId: AccountId,
    kind: 'expense' | 'income',
    currencyCode: string,
  ) => AccountId | undefined;
  descriptionDefaults?: Readonly<Record<string, string>>;
  openMerchants?: readonly string[];
}

/** Loaded inside the accounting writer for permission, role and account revalidation. */
export async function loadCaptureContext(workplaceId: WorkplaceId): Promise<CaptureContext> {
  const [matchers, accounts] = await Promise.all([
    loadAccountMatcherContext(workplaceId),
    accountQueryRepository.findAll(workplaceId),
  ]);
  const snapshot = preferences.workplace.getSnapshot(workplaceId);
  const config = snapshot.automaticTransactionCapture;
  const categoryDefaults = snapshot.captureCategoryDefaults ?? [];
  const accountIndex = createCaptureAccountIndex(accounts, config?.uncategorizedAccountIds);
  return {
    matchers,
    sourceAccountCurrency: id =>
      accountIndex.isAvailableLeaf(id) ? accountIndex.byId.get(id)?.currencyCode : undefined,
    isFinancialLeaf: id => accountIndex.isFinancialLeaf(id),
    captureEnabled: config?.enabled === true,
    captureEnabledAt: config?.enabledAt,
    descriptionDefaults: preferences.workplace.getSnapshot(workplaceId).captureDescriptionDefaults,
    openMerchants: preferences.workplace.getSnapshot(workplaceId).openCaptureMerchants,
    categoryDefault: (merchant, financialAccountId, kind, currencyCode) => {
      const key = categoryDefaultKey({ merchant, financialAccountId, kind, currencyCode });
      const matching = categoryDefaults.filter(value => categoryDefaultKey(value) === key);
      if (matching.length !== 1) return undefined;
      const selected = matching[0];
      if (selected.conflictingCategoryAccountIds?.length) return undefined;
      const uncategorizedId = config?.uncategorizedAccountIds[`${kind}:${currencyCode}`];
      if (selected.categoryAccountId === uncategorizedId) return undefined;
      return accountIndex.isCategoryLeaf(
        selected.categoryAccountId,
        kind,
        currencyCode,
        uncategorizedId,
      )
        ? selected.categoryAccountId
        : undefined;
    },
    uncategorizedAccount: (kind, currencyCode) => {
      const id = config?.uncategorizedAccountIds[`${kind}:${currencyCode}`];
      return id && accountIndex.isCategoryLeaf(id, kind, currencyCode) ? id : undefined;
    },
  };
}
