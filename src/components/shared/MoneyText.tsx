import { FitText, type FitTextSizing } from '@/src/components/shared/FitText';
import { AppText, type AppTextProps } from '@/src/components/core/AppText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import type { MoneyFormatStyle } from '@/src/utils/currencyFormatter';

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  formatStyle?: MoneyFormatStyle;
  loading?: boolean;
  /** Sign prefix (+/-/etc). Masked together with the amount in privacy mode. */
  prefix?: string;
  /**
   * Shrink to fit one line via FitText (works on web, unlike adjustsFontSizeToFit).
   * Use for hero / summary amounts that can overflow; replaces numberOfLines/adjustsFontSizeToFit.
   */
  fit?: FitTextSizing;
};

/**
 * Privacy-aware amount label (RN Text). Must render under PrivacyScopeProvider.
 * For SVG / string embeds use useMoneyFormat (with optional per-call prefix).
 */
export function MoneyText({
  amount,
  currencyCode,
  formatStyle,
  loading,
  prefix,
  fontRole = 'numeric',
  weight = 'semibold',
  tabular = true,
  fit,
  ...textProps
}: MoneyTextProps) {
  const formatMoney = useMoneyFormat({ style: formatStyle, loading, prefix });
  if (fit) {
    const {
      numberOfLines: _n,
      adjustsFontSizeToFit: _a,
      minimumFontScale: _m,
      ...rest
    } = textProps;
    return (
      <FitText fontRole={fontRole} weight={weight} tabular={tabular} {...fit} {...rest}>
        {formatMoney(amount, currencyCode)}
      </FitText>
    );
  }
  return (
    <AppText fontRole={fontRole} weight={weight} tabular={tabular} {...textProps}>
      {formatMoney(amount, currencyCode)}
    </AppText>
  );
}
