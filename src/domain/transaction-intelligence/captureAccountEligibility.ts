import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';

export interface CaptureAccountRecord {
  id: AccountId;
  name: string;
  accountType: AccountType;
  currencyCode: string;
  parentAccountId?: AccountId | null;
  archivedAt?: Date | number | null;
  deletedAt?: Date | number | null;
}

export interface CaptureAccountIndex {
  byId: ReadonlyMap<AccountId, CaptureAccountRecord>;
  financialCurrencies: string[];
  isAvailableLeaf(accountId: AccountId): boolean;
  isFinancialLeaf(accountId: AccountId, currencyCode?: string): boolean;
  isCategoryLeaf(
    accountId: AccountId,
    kind: 'expense' | 'income',
    currencyCode: string,
    uncategorizedAccountId?: AccountId,
  ): boolean;
  isUncategorizedRole(
    accountId: AccountId,
    kind: 'expense' | 'income',
    currencyCode: string,
  ): boolean;
}

/** One account eligibility definition shared by capture setup, suggestions, and posting. */
export function createCaptureAccountIndex(
  accounts: readonly CaptureAccountRecord[],
  uncategorizedAccountIds: Readonly<Record<string, AccountId>> = {},
): CaptureAccountIndex {
  const byId = new Map(accounts.map(account => [account.id, account]));
  const parentIds = new Set(accounts.map(account => account.parentAccountId).filter(Boolean));
  const isAvailableLeaf = (
    account: CaptureAccountRecord | undefined,
  ): account is CaptureAccountRecord =>
    !!account && !account.archivedAt && !account.deletedAt && !parentIds.has(account.id);
  const financialCurrencies = [
    ...new Set(
      accounts
        .filter(
          account =>
            isAvailableLeaf(account) &&
            (account.accountType === AccountType.ASSET ||
              account.accountType === AccountType.LIABILITY),
        )
        .map(account => account.currencyCode.toUpperCase())
        .filter(currencyCode => /^[A-Z]{3}$/.test(currencyCode)),
    ),
  ];

  return {
    byId,
    financialCurrencies,
    isAvailableLeaf: accountId => isAvailableLeaf(byId.get(accountId)),
    isFinancialLeaf: (accountId, currencyCode) => {
      const account = byId.get(accountId);
      return (
        isAvailableLeaf(account) &&
        (account.accountType === AccountType.ASSET ||
          account.accountType === AccountType.LIABILITY) &&
        (!currencyCode || account.currencyCode === currencyCode)
      );
    },
    isCategoryLeaf: (accountId, kind, currencyCode, uncategorizedAccountId) => {
      const account = byId.get(accountId);
      const expectedType = kind === 'expense' ? AccountType.EXPENSE : AccountType.INCOME;
      return (
        isAvailableLeaf(account) &&
        account.accountType === expectedType &&
        account.currencyCode === currencyCode &&
        account.id !== uncategorizedAccountId
      );
    },
    isUncategorizedRole: (accountId, kind, currencyCode) => {
      const key = `${kind}:${currencyCode}`;
      return uncategorizedAccountIds[key] === accountId;
    },
  };
}

export function captureRoleMappingsAreEligible(
  index: CaptureAccountIndex,
  mappings: Readonly<Record<string, AccountId>>,
): boolean {
  return index.financialCurrencies.every(currencyCode =>
    (['expense', 'income'] as const).every(kind => {
      const accountId = mappings[`${kind}:${currencyCode}`];
      return !!accountId && index.isCategoryLeaf(accountId, kind, currencyCode);
    }),
  );
}
