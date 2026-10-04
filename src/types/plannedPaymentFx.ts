/** Absent mode preserves legacy amount-currency conversion behavior. */
export type PlannedPaymentFxMode = 'automatic' | 'fixed' | 'manual';

export interface PlannedPaymentFxFields {
  fxMode?: PlannedPaymentFxMode;
  /** Native destination amount: required for fixed FX, optional review prefill for manual FX. */
  destinationAmount?: number;
}
