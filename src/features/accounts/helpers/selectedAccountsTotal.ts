import { ACCOUNT_TYPES, knownAccountType } from '@/src/domain/accounting/presentationPolicy';
import { sumByCurrency } from '@/src/domain/money/sumByCurrency';
import type { AccountBalance, MoneyAmount } from '@/src/types/domainReadModels';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';

export type SelectedAccountsSection = {
  accountType: AccountType;
  amounts: MoneyAmount[];
};

export function computeSelectedAccountsTotal(
  accounts: readonly {
    id: AccountFields['id'];
    currencyCode: AccountFields['currencyCode'];
    accountType?: string | null;
  }[],
  balancesByAccountId: ReadonlyMap<
    AccountId,
    Pick<AccountBalance, 'directBalance'> & { accountType?: string | null }
  >,
  selectedAccountIds: ReadonlySet<AccountId>,
): { amounts: MoneyAmount[]; sections: SelectedAccountsSection[]; incomplete: boolean } {
  if (selectedAccountIds.size === 0) {
    return { amounts: [], sections: [], incomplete: false };
  }

  const amountsByType = new Map<AccountType, MoneyAmount[]>();
  let matched = 0;

  for (const { id, currencyCode, accountType } of accounts) {
    if (!selectedAccountIds.has(id)) continue;
    const balance = balancesByAccountId.get(id);
    if (!balance || !Number.isFinite(balance.directBalance) || !currencyCode?.trim()) continue;

    const type = knownAccountType(accountType) ?? knownAccountType(balance.accountType);
    // Unknown types must not silently land in ASSET — leave the total incomplete instead.
    if (!type) continue;

    matched += 1;
    const bucket = amountsByType.get(type) ?? [];
    bucket.push({ amount: balance.directBalance, currencyCode });
    amountsByType.set(type, bucket);
  }

  const sections: SelectedAccountsSection[] = [];
  for (const type of ACCOUNT_TYPES) {
    const bucket = amountsByType.get(type);
    if (!bucket?.length) continue;
    sections.push({ accountType: type, amounts: sumByCurrency(bucket) });
  }

  return {
    // Flat amounts are only meaningful within one account type — mixed types stay in sections.
    amounts: sections.length === 1 ? sections[0].amounts : [],
    sections,
    incomplete: matched < selectedAccountIds.size,
  };
}
