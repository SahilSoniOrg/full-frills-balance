import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';

export function accountsCollection() {
  return database.collections.get<Account>('accounts');
}

export function accountMetadataCollection() {
  return database.collections.get<AccountMetadata>('account_metadata');
}
