import { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import { JournalDisplayType } from '@/src/types/enums';

/**
 * Presentation DTO for the dashboard "Upcoming" planned section.
 * Discriminates real planned journals from STS-simulated liability outflows.
 */
export type PlannedOccurrenceOrigin = 'PLANNED_JOURNAL' | 'SIMULATED_LIABILITY';

export interface PlannedOccurrenceAccountRef {
  id: AccountId | string;
  name: string;
  accountType: string;
  role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
  icon?: string;
}

interface PlannedOccurrenceBase {
  id: string;
  occurrenceDate: number;
  title: string;
  amount: number;
  currencyCode: string;
  displayType: JournalDisplayType | string;
  accounts: PlannedOccurrenceAccountRef[];
}

export type PlannedJournalOccurrence = PlannedOccurrenceBase & {
  origin: 'PLANNED_JOURNAL';
  journalId: JournalId | string;
  plannedPaymentId?: PlannedPaymentId;
};

export type SimulatedLiabilityOccurrence = PlannedOccurrenceBase & {
  origin: 'SIMULATED_LIABILITY';
  referenceId: string;
  dayOffset: number;
  payFromAccountId: AccountId | string;
  liabilityAccountId: AccountId | string;
};

export type PlannedOccurrenceViewModel = PlannedJournalOccurrence | SimulatedLiabilityOccurrence;

export function isSimulatedLiabilityOccurrence(
  item: PlannedOccurrenceViewModel,
): item is SimulatedLiabilityOccurrence {
  return item.origin === 'SIMULATED_LIABILITY';
}
