/** Monetary amounts are always expressed in the report query's target currency. */
export interface MoneyMeasure {
  readonly kind: 'MONEY';
  readonly amount: number;
  readonly currencyCode: string;
}

export interface PercentageMeasure {
  readonly kind: 'PERCENTAGE';
  /** null means the percentage is unavailable, not zero. */
  readonly value: number | null;
}

export interface CountMeasure {
  readonly kind: 'COUNT';
  readonly value: number;
}

export interface RatioMeasure {
  readonly kind: 'RATIO';
  readonly value: number;
}

export type ReportMeasure = MoneyMeasure | PercentageMeasure | CountMeasure | RatioMeasure;
