import {
  AccountingDomainService,
  accountingDomainService,
} from '@/src/services/accounting/AccountingDomainService';

export type { JournalValidationResult } from '@/src/services/accounting/AccountingDomainService';
export const AccountingService = AccountingDomainService;
export type AccountingService = AccountingDomainService;
export const accountingService = accountingDomainService;
