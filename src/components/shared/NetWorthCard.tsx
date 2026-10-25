import { useTheme } from '@/src/hooks/use-theme';
import { MetricHeroCard } from './MetricHeroCard';

interface NetWorthCardProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currencyCode: string;
  isLoading?: boolean;
}

export const NetWorthCard = ({
  netWorth,
  totalAssets,
  totalLiabilities,
  currencyCode,
  isLoading = false,
}: NetWorthCardProps) => {
  const { theme } = useTheme();

  return (
    <MetricHeroCard
      title="Net Worth"
      amount={netWorth}
      currencyCode={currencyCode}
      isLoading={isLoading}
      left={{
        dotColor: theme.asset,
        label: 'Assets',
        amount: totalAssets,
        moneyColor: 'asset',
      }}
      right={{
        dotColor: theme.liability,
        label: 'Liabilities',
        amount: totalLiabilities,
        moneyColor: 'liability',
      }}
    />
  );
};
