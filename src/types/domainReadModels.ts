import { AccountId, JournalId, PlannedPaymentId, TransactionId } from './ids';
import { AccountType, JournalDisplayType, SemanticType, TransactionType } from './enums';

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface AccountBalance {
  accountId: AccountId;
  balance: number;
  directBalance: number;
  currencyCode: string;
  transactionCount: number;
  directTransactionCount: number;
  asOfDate: number;
  accountType: AccountType;
  icon?: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  childBalances?: { currencyCode: string; balance: number; transactionCount: number }[];
}

export interface DisplayCounterAccount {
  id: AccountId;
  name: string;
  accountType: AccountType;
  icon?: string;
}

export interface DisplayTransaction {
  id: TransactionId;
  journalId?: JournalId;
  accountId: AccountId;
  amount: number;
  currencyCode: string;
  transactionType: TransactionType;
  transactionDate: number;
  notes?: string;
  journalDescription?: string;
  accountName?: string;
  accountType?: AccountType;
  counterAccounts?: DisplayCounterAccount[];
  displayTitle: string;
  displayType?: JournalDisplayType;
  icon?: string;
  isIncrease: boolean;
  flowDirection?: 'IN' | 'OUT';
  balanceImpact?: 'INCREASE' | 'DECREASE';
  runningBalance?: number;
  exchangeRate?: number;
  semanticType?: string;
  semanticLabel?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JournalWithTransactionSummary {
  id: JournalId;
  journalDate: number;
  description?: string;
  currencyCode: string;
  status: string;
  totalDebits: number;
  totalCredits: number;
  transactionCount: number;
  isBalanced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountWithBalance {
  id: AccountId;
  name: string;
  accountType: AccountType;
  currencyCode: string;
  description?: string;
  currentBalance: number;
  transactionCount: number;
  lastActivityDate?: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrichedJournal {
  id: JournalId;
  journalDate: number;
  description?: string;
  currencyCode: string;
  status: string;
  totalAmount: number;
  transactionCount: number;
  displayType: JournalDisplayType;
  accounts: {
    id: AccountId;
    name: string;
    accountType: string;
    icon?: string;
    role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
    amount?: number;
  }[];
  semanticType?: SemanticType;
  semanticLabel?: string;
  notes?: string;
  plannedPaymentId?: PlannedPaymentId;
}

export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpenses: number;
  netWorth: number;
}
