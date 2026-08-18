export function keepProjectablePlannedJournals<
  TJournal extends { plannedPaymentId?: string | null },
  TPayment extends { id: string },
>(journals: TJournal[], plannedPayments: TPayment[]): TJournal[] {
  const activeIds = new Set(plannedPayments.map(payment => payment.id));
  return journals.filter(
    journal => !journal.plannedPaymentId || activeIds.has(journal.plannedPaymentId),
  );
}
