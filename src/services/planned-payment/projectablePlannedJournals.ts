export const ORPHANED_PLANNED_JOURNAL_NOTICE =
  'Its planned payment was deleted. Post it as a regular transaction or delete it.';

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
