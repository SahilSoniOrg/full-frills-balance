import { AccountFields } from '@/src/types/plainDtos';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import type { TabType } from '@/src/types/domainJournal';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import type { FxFetchedRates, FxOverride } from '@/src/features/journal/entry/fxPair';

/**
 * `fxRates` and `fxOverride` are the FX inputs; `exchangeRate` through `rateError`
 * and the base-rate inputs are projected from them by the bulk editor.
 */
export interface BulkJournalRow {
  id: string;
  description: string;
  notes: string;
  transactionType: TabType;
  amount: string;
  sourceId: AccountId;
  destinationId: AccountId;
  journalDate: number;
  exchangeRate: string; // Cross-rate (source -> destination)
  sourceBaseRate?: number; // Rate to workplace currency
  destBaseRate?: number; // Rate to workplace currency
  sourceBaseRateInput?: string;
  destBaseRateInput?: string;
  isCrossCurrency: boolean;
  convertedAmount: number;
  isLoadingRate: boolean;
  validationError?: string;
  rateError?: string;
  fxRates?: FxFetchedRates | null;
  fxOverride?: FxOverride;
}

export interface BulkJournalRowActions {
  setDescription: (rowId: string, value: string) => void;
  setNotes: (rowId: string, value: string) => void;
  setAmount: (rowId: string, value: string) => void;
  setJournalDate: (rowId: string, value: number) => void;
  setTransactionType: (rowId: string, value: TabType) => void;
  setSourceAccount: (rowId: string, value: AccountId) => void;
  setDestinationAccount: (rowId: string, value: AccountId) => void;
  setConvertedAmount: (rowId: string, value: number) => void;
  setManualBaseRate: (rowId: string, role: 'source' | 'destination', value: string) => void;
  applySuggestion: (rowId: string, suggestion: JournalAutofillSuggestion) => void;
}

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
