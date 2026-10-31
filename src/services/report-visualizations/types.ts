import type { JournalId } from '@/src/types/ids';
import type { TransactionType } from '@/src/types/enums';

export interface SpendingHeatmapTransaction {
  journalId: JournalId;
  transactionType: TransactionType;
  transactionDate: number;
  amount: number;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  value: number;
  label?: string;
  monthLabel?: string;
  timestamp?: number;
  periodEndTimestamp?: number;
  journalIds?: JournalId[];
}

export interface IncomeVsExpenseHistoryPoint {
  startDate: number;
  endDate?: number;
  expense: number;
}

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
  /** Share of total inflow (0–100). Omitted for the hub node. */
  percentOfIncome?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeySummary {
  totalIncome: number;
  totalExpense: number;
  surplus: number;
  deficit: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  summary: SankeySummary;
}
