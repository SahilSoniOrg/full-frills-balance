import type { PlannedOccurrenceJournals } from '@/src/data/repositories/journal/JournalPlannedQueries';
import type {
  OccurrenceTransition,
  PlannedOccurrenceAction,
} from './plannedOccurrenceSettlementTypes';

/** Selects the occurrence transition from its current journal facts and requested action. */
export function resolveOccurrenceTransition(
  action: PlannedOccurrenceAction,
  occurrence: PlannedOccurrenceJournals,
): OccurrenceTransition {
  if (action.kind === 'generate') {
    if (occurrence.kind === 'settled') return { kind: 'generateClaimed' };
    return occurrence.kind === 'planned'
      ? { kind: 'generateExisting', action, journals: occurrence.journals }
      : { kind: 'generateNew', action };
  }
  if (action.kind === 'autoPostDue') {
    const journal =
      occurrence.kind === 'planned'
        ? occurrence.journals.find(candidate => candidate.id === action.journalId)
        : undefined;
    return journal ? { kind: 'autoPost', action, journal } : { kind: 'autoPostNoop' };
  }
  if (occurrence.kind === 'settled') return { kind: 'settled', journalId: occurrence.journalId };
  const journals = occurrence.kind === 'planned' ? occurrence.journals : [];
  if (action.kind === 'skip') {
    return journals.length > 0
      ? { kind: 'skipExisting', action, journals }
      : { kind: 'skipNew', action };
  }
  return journals.length > 0
    ? { kind: 'postExisting', action, journals }
    : { kind: 'postNew', action };
}
