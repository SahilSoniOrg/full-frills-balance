import Account from '@/src/data/models/Account';
import { Flow, FlowSource, Outflow } from '@/src/services/simulation/types';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import {
  PlannedJournalOccurrence,
  PlannedOccurrenceViewModel,
  SimulatedLiabilityOccurrence,
} from '../types/PlannedOccurrenceViewModel';

export interface MapSimulatedLiabilityInput {
  allFlows: Flow[];
  accountMap: Map<string, Account>;
  currencyCode: string;
  /** Epoch ms for start-of-day used to resolve dayOffset → occurrenceDate. Defaults to local today. */
  todayStartMs?: number;
}

function isLiabilityOutflow(flow: Flow): flow is Outflow {
  return flow.kind === 'OUTFLOW' && flow.origin === FlowSource.LIABILITY;
}

/**
 * Maps STS liability OUTFLOW rows into presentation DTOs.
 * Does not forge EnrichedJournal / synthetic_* IDs.
 */
export function mapLiabilityFlowsToPlannedOccurrences(
  input: MapSimulatedLiabilityInput,
): SimulatedLiabilityOccurrence[] {
  const todayStartMs = input.todayStartMs ?? new Date().setHours(0, 0, 0, 0);
  const currencyCode = input.currencyCode || 'INR';

  return input.allFlows.filter(isLiabilityOutflow).map((flow, index) => {
    const occurrenceDate = todayStartMs + flow.dayOffset * 24 * 60 * 60 * 1000;
    const payFromAccount = input.accountMap.get(flow.accountId);
    const liabilityAccount = input.accountMap.get(flow.referenceId);
    const payFromAccountName = payFromAccount?.name || 'Checking';

    return {
      origin: 'SIMULATED_LIABILITY',
      id: `liability:${flow.referenceId}:${flow.dayOffset}:${index}`,
      occurrenceDate,
      title: flow.label,
      amount: flow.amount,
      currencyCode,
      displayType: JournalDisplayType.EXPENSE,
      referenceId: flow.referenceId,
      dayOffset: flow.dayOffset,
      payFromAccountId: flow.accountId,
      liabilityAccountId: flow.referenceId,
      accounts: [
        {
          id: flow.accountId,
          name: payFromAccountName,
          accountType: 'ASSET',
          role: 'SOURCE',
          icon: payFromAccount?.icon || 'wallet',
        },
        {
          id: flow.referenceId,
          name: liabilityAccount?.name || flow.label,
          accountType: 'LIABILITY',
          role: 'DESTINATION',
          icon: liabilityAccount?.icon || 'creditCard',
        },
      ],
    };
  });
}

/** Adapts a real planned EnrichedJournal into the shared planned-section DTO. */
export function mapPlannedJournalToOccurrence(journal: EnrichedJournal): PlannedJournalOccurrence {
  return {
    origin: 'PLANNED_JOURNAL',
    id: journal.id,
    journalId: journal.id,
    plannedPaymentId: journal.plannedPaymentId,
    occurrenceDate: journal.journalDate,
    title: journal.description || '',
    amount: journal.totalAmount,
    currencyCode: journal.currencyCode,
    displayType: journal.displayType,
    accounts: journal.accounts.map(account => ({
      id: account.id,
      name: account.name,
      accountType: account.accountType,
      role: account.role,
      icon: account.icon,
    })),
  };
}

export function mergePlannedOccurrences(
  plannedJournals: EnrichedJournal[],
  simulated: SimulatedLiabilityOccurrence[],
): PlannedOccurrenceViewModel[] {
  return [...plannedJournals.map(mapPlannedJournalToOccurrence), ...simulated];
}
