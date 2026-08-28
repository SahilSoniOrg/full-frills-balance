import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
}

export const SafeToSpendBreakdownBar = ({
  effectiveTotal,
  committedTotal,
  committedLiabilities,
  safeToSpend,
}: SafeToSpendBreakdownBarProps) => {
  const { theme } = useTheme();

  if (effectiveTotal <= 0) {
    return null;
  }

  return (
    <Box
      background="pureInverse"
      backgroundOpacity="active"
      height={10}
      borderRadius="full"
      flexDirection="row"
      overflow="hidden"
    >
      {committedTotal > 0 && (
        <Box height="100%" flex={committedTotal} unsafe_backgroundRaw={theme.warning} />
      )}
      {committedLiabilities > 0 && (
        <Box height="100%" flex={committedLiabilities} unsafe_backgroundRaw={theme.error} />
      )}
      {safeToSpend > 0 && (
        <Box height="100%" flex={safeToSpend} unsafe_backgroundRaw={theme.primary} />
      )}
    </Box>
  );
};
