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

const PERSON_ROLE_LABELS: Record<AccountType, string> = {
  [AccountType.ASSET]: 'Owes you',
  [AccountType.LIABILITY]: 'You owe',
  [AccountType.EXPENSE]: 'Shared cost',
  [AccountType.INCOME]: 'Shared income',
  [AccountType.EQUITY]: 'Settled balance',
};

export function formatPersonPickerLabel(
  account: Pick<AccountFields, 'id' | 'name' | 'accountType'>,
  peopleGroups?: readonly PersonPickerGroup[],
): string | undefined {
  if (!peopleGroups || peopleGroups.length === 0) return undefined;
  const person = peopleGroups.find(group => group.accountIds.includes(account.id));
  if (!person) return undefined;
  const accountType = toAccountType(account.accountType);
  if (!accountType) return account.name;
  const samePersonAccounts = person.accountIds.length;
  if (samePersonAccounts === 1 && accountType === AccountType.ASSET) {
    return `${person.personName} · Owes you`;
  }
  return `${person.personName} · ${PERSON_ROLE_LABELS[accountType]}`;
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
  const personNameForAccount = (id: AccountId) =>
    peopleGroups.find(group => group.accountIds.includes(id))?.personName ?? '';
  const data = filteredAccounts
    .filter(account => personAccountIds.has(account.id))
    .filter(account => {
      const person = peopleGroups.find(group => group.accountIds.includes(account.id));
      return includeArchivedPeople || !person?.archived;
    })
    .sort(
      (a, b) =>
        personNameForAccount(a.id).localeCompare(personNameForAccount(b.id)) ||
        a.name.localeCompare(b.name),
    );
  const personSections: AccountSection[] = data.length
    ? [{ key: 'people', title: 'People', data }]
    : [];
  return [...mySections, ...personSections];
}
