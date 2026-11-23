import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import { AccountId } from '@/src/types/ids';

export interface BudgetInput {
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  intervalType?: string;
  intervalN?: number;
  startDate?: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  active?: boolean;
  assetAccountIds?: AccountId[];
}

export type BudgetMergeRecords = {
  scopes: BudgetScope[];
  budgets: Budget[];
};

export type BudgetAuditSnapshot = {
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  intervalType: string;
  intervalN: number;
  startDate: number | null;
  recurrenceDay: number | null;
  recurrenceMonth: number | null;
  active: boolean;
  assetAccountIds: string[];
  scopedAccountIds: string[];
} & Record<string, unknown>;
