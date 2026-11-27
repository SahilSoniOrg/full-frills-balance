import type { AccountSection } from '@/src/design-system/accountPresentation';
import { getAccountSections } from '@/src/design-system/accountPresentation';
import { toAccountType } from '@/src/domain/accounts/accountClassification';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields, PlainAccount } from '@/src/types/plainDtos';

export interface PersonPickerGroup {
  personId: string;
  personName: string;
  archived?: boolean;
  accountIds: readonly AccountId[];
}

const PERSON_ACCOUNT_PRIORITY: AccountType[] = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.EXPENSE,
  AccountType.INCOME,
  AccountType.EQUITY,
];

export function formatPersonPickerLabel(
  account: Pick<AccountFields, 'id' | 'name' | 'accountType' | 'currencyCode'>,
  peopleGroups?: readonly PersonPickerGroup[],
): string | undefined {
  if (!peopleGroups || peopleGroups.length === 0) return undefined;
  const person = peopleGroups.find(group => group.accountIds.includes(account.id));
  if (!person) return undefined;
  return person.accountIds.length > 1
    ? `${person.personName} · ${person.accountIds.length}`
    : person.personName;
}

export function formatPersonAccountRoleLabel(
  account: Pick<AccountFields, 'id' | 'name' | 'accountType' | 'currencyCode'>,
  peopleGroups?: readonly PersonPickerGroup[],
): string {
  const person = peopleGroups?.find(group => group.accountIds.includes(account.id));
  const accountType = toAccountType(account.accountType);
  const role =
    accountType === AccountType.ASSET
      ? 'Owes you'
      : accountType === AccountType.LIABILITY
        ? 'You owe'
        : accountType === AccountType.EXPENSE
          ? 'Shared cost'
          : accountType === AccountType.INCOME
            ? 'Shared income'
            : accountType === AccountType.EQUITY
              ? 'Settled balance'
              : undefined;
  if (!person || !role) return account.name;
  return `${role} · ${account.currencyCode} · ${account.name}`;
}

export function pickPersonRepresentativeAccount<T extends AccountFields | PlainAccount>(
  accounts: readonly T[],
): T | undefined {
  if (accounts.length === 0) return undefined;
  for (const type of PERSON_ACCOUNT_PRIORITY) {
    const match = accounts.find(account => toAccountType(account.accountType) === type);
    if (match) return match;
  }
  return accounts[0];
}

export function linkedAccountsForPerson<T extends AccountFields | PlainAccount>(
  person: PersonPickerGroup,
  accounts: readonly T[],
): T[] {
  const ids = new Set(person.accountIds);
  return accounts.filter(account => ids.has(account.id));
}

export function isPersonPickerSelection(
  accountId: AccountId,
  selectedId: AccountId | undefined,
  peopleGroups?: readonly PersonPickerGroup[],
): boolean {
  if (!selectedId) return false;
  if (accountId === selectedId) return true;
  const person = peopleGroups?.find(group => group.accountIds.includes(accountId));
  return Boolean(person?.accountIds.includes(selectedId));
}

export function buildJournalPickerSections(
  filteredAccounts: (AccountFields | PlainAccount)[],
  peopleGroups?: readonly PersonPickerGroup[],
  includeArchivedPeople = false,
): AccountSection[] {
  if (!peopleGroups || peopleGroups.length === 0) return getAccountSections(filteredAccounts);

  const personAccountIds = new Set(peopleGroups.flatMap(group => group.accountIds));
  const mySections = getAccountSections(
    filteredAccounts.filter(account => !personAccountIds.has(account.id)),
  );
  const personAccounts = filteredAccounts.filter(account => {
    if (!personAccountIds.has(account.id)) return false;
    const person = peopleGroups.find(group => group.accountIds.includes(account.id));
    return includeArchivedPeople || !person?.archived;
  });
  const byPerson = new Map<string, (AccountFields | PlainAccount)[]>();
  for (const account of personAccounts) {
    const person = peopleGroups.find(group => group.accountIds.includes(account.id));
    if (!person) continue;
    const rows = byPerson.get(person.personId) ?? [];
    rows.push(account);
    byPerson.set(person.personId, rows);
  }
  const peopleData = [...byPerson.entries()]
    .map(([personId, accounts]) => {
      const person = peopleGroups.find(group => group.personId === personId);
      const representative = pickPersonRepresentativeAccount(accounts);
      return person && representative
        ? { personName: person.personName, account: representative }
        : null;
    })
    .filter((row): row is { personName: string; account: AccountFields | PlainAccount } =>
      Boolean(row),
    )
    .sort((a, b) => a.personName.localeCompare(b.personName))
    .map(row => row.account);

  const personSections: AccountSection[] = peopleData.length
    ? [{ key: 'people', title: 'People', data: peopleData }]
    : [];
  return [...mySections, ...personSections];
}
