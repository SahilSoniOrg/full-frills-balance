import type { WorkplaceId } from '@/src/types/ids';

export type CashClarityPublicationOutcome = {
  readonly workplaceId: WorkplaceId;
  readonly status: 'published' | 'already_published';
};

export type CashClarityPublicationErrorCode =
  | 'invalid_input'
  | 'missing_spendable_account'
  | 'ambiguous_existing_publication'
  | 'incomplete_publication'
  | 'save_failed';

export class CashClarityPublicationError extends Error {
  constructor(
    readonly code: CashClarityPublicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CashClarityPublicationError';
  }
}
