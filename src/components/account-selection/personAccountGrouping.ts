import type { AccountSection } from '@/src/design-system/accountPresentation';
import { getAccountSections } from '@/src/design-system/accountPresentation';
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
  const personSections: AccountSection[] = [...peopleGroups]
    .filter(group => includeArchivedPeople || !group.archived)
    .sort((a, b) => a.personName.localeCompare(b.personName))
    .flatMap(group => {
      const accountIds = new Set(group.accountIds);
      const data = filteredAccounts.filter(account => accountIds.has(account.id));
      return data.length
        ? [
            {
              key: `person:${group.personId}`,
              title: `People · ${group.personName}`,
              type: data[0].accountType,
              data,
            },
          ]
        : [];
    });
  return [...mySections, ...personSections];
}
