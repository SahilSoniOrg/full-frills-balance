import {
  getStagedAccounts,
  getStagedPersonAccounts,
  runAccountingWriteSession,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import {
  personQueryRepository,
  personWriteRepository,
  type PersonNameOptions,
  type PersonProfileInput,
  type PersonProfilePatch,
} from '@/src/data/repositories/people';
import { isCompatiblePersonAccount } from '@/src/domain/people';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { Icon } from '@/src/types/domainIcons';
import type { AccountId, PersonId, WorkplaceId } from '@/src/types/ids';
import type Account from '@/src/data/models/Account';
import type Person from '@/src/data/models/Person';
import type PersonAccount from '@/src/data/models/PersonAccount';
import type { PersonAccountRole } from '@/src/domain/people';

export type { PersonNameOptions, PersonProfileInput, PersonProfilePatch };

export function createPerson(
  workplaceId: WorkplaceId,
  input: PersonProfileInput & { initialAccountId?: AccountId },
  options?: PersonNameOptions,
): Promise<Person> {
  return runAccountingWriteSession(async session => {
    const { initialAccountId, ...profile } = input;
    const person = await personWriteRepository.createPersonInSession(
      session,
      workplaceId,
      profile,
      options,
    );
    if (initialAccountId) {
      await linkValidatedAccountInSession(session, workplaceId, person.id, initialAccountId, {
        skipPersonLookup: true,
      });
    }
    return person;
  });
}

/** Create a person and their default receivable account in one accounting batch. */
export function createPersonWithReceivable(
  workplaceId: WorkplaceId,
  input: PersonProfileInput & { currencyCode: string },
  options?: PersonNameOptions,
): Promise<{ person: Person; account: Account }> {
  return runAccountingWriteSession(async session => {
    const { currencyCode, ...profile } = input;
    const person = await personWriteRepository.createPersonInSession(
      session,
      workplaceId,
      profile,
      options,
    );
    const account = await ensurePersonAccountInSession(
      session,
      workplaceId,
      person.id,
      'receivable',
      currencyCode,
      { personName: person.name },
    );
    return { person, account };
  });
}
export function updatePerson(
  workplaceId: WorkplaceId,
  personId: PersonId,
  patch: PersonProfilePatch,
  options?: PersonNameOptions,
): Promise<Person> {
  return runAccountingWriteSession(session =>
    personWriteRepository.updatePersonInSession(session, workplaceId, personId, patch, options),
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
async function linkValidatedAccountInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  personId: PersonId,
  accountId: AccountId,
  options?: { skipPersonLookup?: boolean },
): Promise<PersonAccount> {
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
  return personWriteRepository.linkAccountInSession(
    session,
    workplaceId,
    personId,
    accountId,
    options,
  );
}

export async function linkExistingAccount(
  workplaceId: WorkplaceId,
  personId: PersonId,
  accountId: AccountId,
): Promise<PersonAccount> {
  return runAccountingWriteSession(session =>
    linkValidatedAccountInSession(session, workplaceId, personId, accountId),
  );
}

/** Soft-deletes the person↔account link. The ledger account itself is unchanged. */
export async function unlinkExistingAccount(
  workplaceId: WorkplaceId,
  personId: PersonId,
  accountId: AccountId,
): Promise<PersonAccount> {
  return runAccountingWriteSession(session =>
    personWriteRepository.unlinkAccountInSession(session, workplaceId, personId, accountId),
  );
}
export async function ensurePersonAccountInSession(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  personId: PersonId,
  role: PersonAccountRole,
  currencyCode: string,
  options?: { personName?: string },
): Promise<Account> {
  const normalizedCurrencyCode = currencyCode.trim().toUpperCase();
  if (!normalizedCurrencyCode) throw new Error('Currency is required for a person account');
  const [persistedLinks, persistedAccounts] = await Promise.all([
    personQueryRepository.listPersonAccounts(workplaceId, personId),
    accountQueryRepository.findAll(workplaceId),
  ]);
  const stagedLinks = getStagedPersonAccounts(session, workplaceId).filter(
    link => link.personId === personId,
  );
  const links = [...persistedLinks, ...stagedLinks];
  const accounts = [...persistedAccounts, ...getStagedAccounts(session, workplaceId)];
  const linkedAccounts = accounts.filter(
    account =>
      !account.deletedAt &&
      !account.archivedAt &&
      account.currencyCode?.toUpperCase() === normalizedCurrencyCode &&
      account.accountType === typeForRole(role) &&
      links.some(link => !link.deletedAt && link.accountId === account.id) &&
      isCompatiblePersonAccount({
        id: account.id,
        type: account.accountType,
        subtype: account.accountSubtype ?? AccountSubtype.OTHER,
        currencyCode: account.currencyCode,
      }),
  );
  const linked =
    linkedAccounts.find(account => account.accountSubtype === subtypeForRole(role)) ??
    linkedAccounts[0];
  if (linked) return linked;
  const person = options?.personName
    ? undefined
    : await personQueryRepository.findPerson(workplaceId, personId);
  if (!options?.personName && !person) throw new Error('Person not found');
  const roleLabel =
    role === 'receivable'
      ? 'Receivable'
      : role === 'payable'
        ? 'Payable'
        : role === 'expense'
          ? 'Expense'
          : 'Income';
  const base = `${options?.personName ?? person!.name} (${roleLabel} · ${normalizedCurrencyCode})`;
  let name = base;
  let suffix = 2;
  while (
    accounts.some(account => account.name.trim().toLowerCase() === name.trim().toLowerCase())
  ) {
    name = `${base} ${suffix++}`;
  }
  const account = await accountWriteRepository.createInSession(
    session,
    {
      name,
      accountType: typeForRole(role),
      accountSubtype: subtypeForRole(role),
      currencyCode: normalizedCurrencyCode,
      workplaceId,
      orderNum: 0,
      icon: Icon.User,
    },
    { appendWithinSiblingList: true },
  );
  await personWriteRepository.linkAccountInSession(session, workplaceId, personId, account.id, {
    skipPersonLookup: Boolean(options?.personName),
  });
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
