import { AccountSubtype } from '@/src/data/models/Account';

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
  recurringCandidates: any[];
  expenseTransactions: any[];
  accounts: any[];
  activePlannedPayments: any[];
  workplaceId: string;
}
