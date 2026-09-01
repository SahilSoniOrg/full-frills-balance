import { AppConfig } from '@/src/constants';

/**
 * Typed preview payload for onboarding theme step.
 * Decoupled from dashboard SafeToSpendCard / simulation read models.
 */
export interface SafeToSpendPreviewFixture {
  currencyCode: string;
  safeToSpend: number;
  committedTotal: number;
  committedLiabilities: number;
  displaySafeToSpend: string;
  displayCommitted: string;
  displayDebts: string;
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  /** Static sparkline heights (0–1) for theme preview atmosphere. */
  sparklineNorms: readonly number[];
}

const currencyCode = AppConfig.defaultCurrency || 'INR';

function formatPreviewCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export const SAFE_TO_SPEND_PREVIEW: SafeToSpendPreviewFixture = {
  currencyCode,
  safeToSpend: 2400,
  committedTotal: 800,
  committedLiabilities: 100,
  displaySafeToSpend: formatPreviewCurrency(2400),
  displayCommitted: formatPreviewCurrency(800),
  displayDebts: formatPreviewCurrency(100),
  isOverCommitted: false,
  isPositiveSafeToSpend: true,
  sparklineNorms: [0.35, 0.42, 0.38, 0.55, 0.5, 0.62, 0.58, 0.7, 0.65, 0.78, 0.72, 0.85, 0.8, 0.9],
};
