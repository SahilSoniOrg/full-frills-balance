import {
  AccountSubtype,
  AccountType,
  AuditAction,
  InboxParseStatus,
  InboxProcessingStatus,
  JournalStatus,
  TransactionDirection,
  TransactionType,
} from '@/src/types/enums';
import {
  getDefaultSubtypeForTypeLike,
  isAccountSubtype,
  isAccountType,
} from '@/src/types/accountSubtype';
import type { ImportedAccount } from '@/src/data/repositories/importTypes';

const DEFAULT_ACCOUNT_TYPE = AccountType.ASSET;

export function toAccountType(value: AccountType | string): AccountType {
  return isAccountType(value) ? value : DEFAULT_ACCOUNT_TYPE;
}

export function pickImportedSubtype(account: ImportedAccount): AccountSubtype | undefined {
  if (account.accountSubtype && isAccountSubtype(account.accountSubtype)) {
    return account.accountSubtype;
  }
  return getDefaultSubtypeForTypeLike(account.accountType);
}

export function toJournalStatus(value: string): JournalStatus {
  return Object.values(JournalStatus).includes(value as JournalStatus)
    ? (value as JournalStatus)
    : JournalStatus.POSTED;
}

export function toTransactionType(value: string): TransactionType {
  return Object.values(TransactionType).includes(value as TransactionType)
    ? (value as TransactionType)
    : TransactionType.DEBIT;
}

export function toAuditAction(value: string): AuditAction {
  return Object.values(AuditAction).includes(value as AuditAction)
    ? (value as AuditAction)
    : AuditAction.UPDATE;
}

export function toInboxParseStatus(value: string): InboxParseStatus {
  return Object.values(InboxParseStatus).includes(value as InboxParseStatus)
    ? (value as InboxParseStatus)
    : InboxParseStatus.PARSE_FAILED;
}

export function toInboxProcessingStatus(value: string): InboxProcessingStatus {
  return Object.values(InboxProcessingStatus).includes(value as InboxProcessingStatus)
    ? (value as InboxProcessingStatus)
    : InboxProcessingStatus.PENDING;
}

export function toTransactionDirection(value: string): TransactionDirection {
  return Object.values(TransactionDirection).includes(value as TransactionDirection)
    ? (value as TransactionDirection)
    : TransactionDirection.UNKNOWN;
}
