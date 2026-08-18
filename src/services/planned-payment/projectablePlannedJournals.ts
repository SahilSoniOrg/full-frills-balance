export const ORPHANED_PLANNED_JOURNAL_NOTICE =
  'Its planned payment was deleted. Post it as a regular transaction or delete it.';

/** PLANNED journals linked to a planned payment that no longer exists. */
export function isOrphanedPlannedJournal(input: {
  status: string;
  plannedPaymentId?: string | null;
  plannedPaymentExists: boolean;
}): boolean {
  return (
    input.status === 'PLANNED' && Boolean(input.plannedPaymentId) && !input.plannedPaymentExists
  );
}

/** Keeps manual planned journals and journals whose planned payment is still in the active set. */
export function keepProjectablePlannedJournals<
  TJournal extends { plannedPaymentId?: string | null },
  TPayment extends { id: string },
>(journals: TJournal[], plannedPayments: TPayment[]): TJournal[] {
  const activeIds = new Set(plannedPayments.map(payment => payment.id));
  return journals.filter(
    journal => !journal.plannedPaymentId || activeIds.has(journal.plannedPaymentId),
  );
}
