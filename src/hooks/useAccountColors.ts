import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/enums';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { useMemo } from 'react';

export function useAccountColors(account: {
  accountType: string | AccountType;
  color?: string | null;
}) {
  const { theme } = useTheme();
  const accountType = account?.accountType;
  const color = account?.color;

  return useMemo(() => {
    return resolveAccountAppearance({ accountType: accountType ?? '', color }, theme);
  }, [accountType, color, theme]);
}
