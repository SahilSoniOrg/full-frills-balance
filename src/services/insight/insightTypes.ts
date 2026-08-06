import Account from '@/src/data/models/Account';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import { RecurringPattern, TransactionMetadata } from '@/src/data/repositories/TransactionTypes';
import { AccountSubtype } from '@/src/types/domain';

export interface Insight {
  id: string;
  type: 'slow-leak' | 'phantom-surplus' | 'subscription-amnesiac' | 'lifestyle-drift';
  severity: 'low' | 'medium' | 'high';
  message: string;
  description: string;
  suggestion: string;
  journalIds: string[];
  amount?: number;
  currencyCode?: string;
  accountSubtype?: AccountSubtype;
  accountName?: string;
}

export interface CalculationInput {
  recurringCandidates: RecurringPattern[];
  expenseTransactions: TransactionMetadata[];
  accounts: Account[];
  activePlannedPayments: PlannedPayment[];
  workplaceId: string;
}
