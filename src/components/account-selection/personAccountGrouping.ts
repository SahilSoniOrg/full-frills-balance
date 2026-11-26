import type { AccountSection } from '@/src/design-system/accountPresentation';
import { getAccountSections } from '@/src/design-system/accountPresentation';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields, PlainAccount } from '@/src/types/plainDtos';

export interface PersonPickerGroup {
  personId: string;
  personName: string;
  archived?: boolean;
  accountIds: readonly AccountId[];
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
    ? [{ key: 'people', title: 'People', type: data[0]?.accountType ?? AccountType.ASSET, data }]
    : [];
  return [...mySections, ...personSections];
}
