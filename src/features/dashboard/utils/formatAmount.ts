/**
 * Re-exports for backward compatibility (tests, SafeToSpendMapper tests).
 * Prefer MoneyText / useMoneyFormat / formatMoneyAmount from moneyFormat.
 */
export {
  FORMAT_AMOUNT_LOADING,
  formatStsAmount as formatAmount,
  formatStsAmountOrLoading as formatAmountOrLoading,
} from '@/src/components/common/moneyFormat';
