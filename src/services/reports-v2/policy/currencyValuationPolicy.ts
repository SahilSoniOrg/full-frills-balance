export type CurrencyValuationPurpose = 'FLOW' | 'BALANCE';
export type CurrencyValuationMethod = 'IDENTITY' | 'HISTORICAL_RATE' | 'PERIOD_END_RATE';
export type MissingRateHandling = 'WARN' | 'ERROR';

export interface CurrencyValuationRule {
  readonly method: CurrencyValuationMethod;
  readonly dateSource: 'NONE' | 'JOURNAL_DATE' | 'PERIOD_ENDPOINT';
}

export interface CurrencyValuationPolicy {
  readonly flow: CurrencyValuationRule;
  readonly balance: CurrencyValuationRule;
  readonly missingRate: MissingRateHandling;
}

export const DEFAULT_CURRENCY_VALUATION_POLICY: CurrencyValuationPolicy = {
  flow: { method: 'HISTORICAL_RATE', dateSource: 'JOURNAL_DATE' },
  balance: { method: 'PERIOD_END_RATE', dateSource: 'PERIOD_ENDPOINT' },
  missingRate: 'WARN',
};

export interface CurrencyValuationRequest {
  readonly purpose: CurrencyValuationPurpose;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly journalDate?: number;
  readonly periodEndpoint?: number;
}

export interface CurrencyValuationDecision {
  readonly method: CurrencyValuationMethod;
  readonly rateDate?: number;
  readonly requiresExchangeRate: boolean;
  readonly missingRateHandling: MissingRateHandling;
}

/**
 * Selects the rate policy without fetching or applying a rate. Rate lookup is
 * intentionally left to the currency adapter so missing data can become a
 * visible report warning.
 */
export function resolveCurrencyValuation(
  policy: CurrencyValuationPolicy,
  request: CurrencyValuationRequest,
): CurrencyValuationDecision {
  if (request.sourceCurrencyCode === request.targetCurrencyCode) {
    return {
      method: 'IDENTITY',
      requiresExchangeRate: false,
      missingRateHandling: policy.missingRate,
    };
  }

  const rule = request.purpose === 'FLOW' ? policy.flow : policy.balance;
  const rateDate =
    rule.dateSource === 'JOURNAL_DATE'
      ? request.journalDate
      : rule.dateSource === 'PERIOD_ENDPOINT'
        ? request.periodEndpoint
        : undefined;

  return {
    method: rule.method,
    rateDate,
    requiresExchangeRate: true,
    missingRateHandling: policy.missingRate,
  };
}
