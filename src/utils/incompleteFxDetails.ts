import type { UnvaluedStartingBalance } from '@/src/services/simulation/types';
import type { MissingRateQuote } from '@/src/services/reports-v2/types/result';

export type IncompleteFxContext = 'safe-to-spend' | 'budget' | 'reports' | 'cash-flow';
export type IncompleteFxBalanceDetail = Pick<
  UnvaluedStartingBalance,
  'accountId' | 'accountName' | 'fromCurrency' | 'toCurrency'
> & { amountLabel: string };

export interface IncompleteFxDetailsRequest {
  context: IncompleteFxContext;
  currencyCode: string;
  unvaluedStartingBalances?: IncompleteFxBalanceDetail[];
  missingRateQuotes?: readonly MissingRateQuote[];
}

type IncompleteFxDetailsListener = (request: IncompleteFxDetailsRequest) => void;

let incompleteFxDetailsListener: IncompleteFxDetailsListener | null = null;

export function setIncompleteFxDetailsListener(listener: IncompleteFxDetailsListener) {
  incompleteFxDetailsListener = listener;
}

export function clearIncompleteFxDetailsListener() {
  incompleteFxDetailsListener = null;
}

export function showIncompleteFxDetails(request: IncompleteFxDetailsRequest) {
  if (!incompleteFxDetailsListener) return;
  incompleteFxDetailsListener(request);
}
