import { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';

export interface BulkJournalRow {
  id: string;
  description: string;
  notes: string;
  amount: string;
  sourceId: AccountId;
  destinationId: AccountId;
  journalDate: number;
  exchangeRate: string; // Cross-rate (source -> destination)
  sourceBaseRate?: number; // Rate to workplace currency
  destBaseRate?: number; // Rate to workplace currency
  isCrossCurrency: boolean;
  convertedAmount: number;
  isLoadingRate: boolean;
  error?: string;
}

export type BulkRowFieldValue = string | number | boolean;

export interface SavedJournalSummary {
  description: string;
  amount: number;
  currency: string;
}

export interface UseBulkJournalEditorProps {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  accounts: AccountFields[];
  onSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
}
