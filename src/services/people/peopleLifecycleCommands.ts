import {
  getStagedAccounts,
  getStagedPersonAccounts,
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { personQueryRepository, personWriteRepository } from '@/src/data/repositories/people';
import { isCompatiblePersonAccount } from '@/src/domain/people';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import type { AccountId, PersonId, WorkplaceId } from '@/src/types/ids';
import type Account from '@/src/data/models/Account';
import type Person from '@/src/data/models/Person';
import type PersonAccount from '@/src/data/models/PersonAccount';
import type { PersonAccountRole } from '@/src/domain/people';

export function createPerson(
  workplaceId: WorkplaceId,
  input: { name: string; notes?: string; color?: string },
): Promise<Person> {
  return runAccountingWriteSession(session =>
    personWriteRepository.createPersonInSession(session, workplaceId, input),
  );
}
export function renamePerson(
  workplaceId: WorkplaceId,
  personId: PersonId,
  name: string,
): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  return runAccountingWriteSession(session =>
    personWriteRepository.updatePersonInSession(session, workplaceId, personId, { name: trimmed }),
  );
}
export function setPersonArchived(
  workplaceId: WorkplaceId,
  personId: PersonId,
  archived: boolean,
): Promise<Person> {
  return runAccountingWriteSession(session =>
    personWriteRepository.setPersonArchivedInSession(session, workplaceId, personId, archived),
  );
}
export async function softDeletePerson(
  workplaceId: WorkplaceId,
  personId: PersonId,
): Promise<void> {
  const [links, items] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    personQueryRepository.listOpenItems(workplaceId, { personId }),
  ]);
  if (links.length || items.length)
    throw new Error('Cannot delete a person with linked accounts or open items');
  await runAccountingWriteSession(session =>
    personWriteRepository.softDeletePersonInSession(session, workplaceId, personId),
  );
}
export async function linkExistingAccount(
  workplaceId: WorkplaceId,
  personId: PersonId,
  accountId: AccountId,
): Promise<PersonAccount> {
  return runAccountingWriteSession(async session => {
    const account = await accountQueryRepository.find(workplaceId, accountId);
    if (!account) throw new Error('Account not found');
    const accounts = await accountQueryRepository.findAll(workplaceId);
    if (accounts.some(a => a.parentAccountId === accountId))
      throw new Error('Cannot link a group account');
    if (
      !isCompatiblePersonAccount({
        id: account.id,
        type: account.accountType,
        subtype: account.accountSubtype ?? AccountSubtype.OTHER,
        currencyCode: account.currencyCode,
      })
    ) {
      throw new Error('Incompatible person account');
    }
    return personWriteRepository.linkAccountInSession(session, workplaceId, personId, accountId);
  });
}
export async function ensurePersonAccountInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  personId: PersonId,
  role: PersonAccountRole,
  currencyCode: string,
): Promise<Account> {
  const [persistedLinks, persistedAccounts] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    accountQueryRepository.findAll(workplaceId),
  ]);
  const stagedLinks = getStagedPersonAccounts(session, workplaceId).filter(
    link => link.personId === personId,
  );
  const links = [...persistedLinks, ...stagedLinks];
  const accounts = [...persistedAccounts, ...getStagedAccounts(session, workplaceId)];
  const linked = links.find(link => {
    const account = accounts.find(a => a.id === link.accountId);
    return (
      !link.deletedAt &&
      account?.currencyCode === currencyCode &&
      account.accountSubtype === subtypeForRole(role) &&
      account.accountType === typeForRole(role)
    );
  });
  if (linked) return accounts.find(a => a.id === linked.accountId)!;
  const person = await personQueryRepository.findPerson(workplaceId, personId);
  if (!person) throw new Error('Person not found');
  const roleLabel =
    role === 'receivable'
      ? 'Receivable'
      : role === 'payable'
        ? 'Payable'
        : role === 'expense'
          ? 'Expense'
          : 'Income';
  const base = `${person.name} (${roleLabel} · ${currencyCode})`;
  let name = base;
  let suffix = 2;
  while (accounts.some(a => a.name === name)) name = `${base} ${suffix++}`;
  const account = await accountWriteRepository.createInSession(
    session,
    {
      name,
      accountType: typeForRole(role),
      accountSubtype: subtypeForRole(role),
      currencyCode,
      workplaceId,
      orderNum: 0,
      icon: Icon.User,
    },
    { appendWithinSiblingList: true },
  );
  await personWriteRepository.linkAccountInSession(session, workplaceId, personId, account.id);
  return account;
}

export function ensurePersonAccount(
  workplaceId: WorkplaceId,
  personId: PersonId,
  kind: PersonAccountRole,
  currencyCode: string,
): Promise<Account> {
  return runAccountingWriteSession(session =>
    ensurePersonAccountInSession(session, workplaceId, personId, kind, currencyCode),
  );
}
function typeForRole(role: PersonAccountRole): AccountType {
  return role === 'receivable'
    ? AccountType.ASSET
    : role === 'payable'
      ? AccountType.LIABILITY
      : role === 'expense'
        ? AccountType.EXPENSE
        : AccountType.INCOME;
}
function subtypeForRole(role: PersonAccountRole): AccountSubtype {
  return role === 'receivable'
    ? AccountSubtype.RECEIVABLE
    : role === 'payable'
      ? AccountSubtype.PAYABLE
      : AccountSubtype.OTHER;
}
