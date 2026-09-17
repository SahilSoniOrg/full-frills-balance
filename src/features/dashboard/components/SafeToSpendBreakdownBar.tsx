import { ChromeMotion } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
}

/** Stacked STS composition bar — soft Moti settle on paint (skipped under reduce motion). */
export const SafeToSpendBreakdownBar = ({
  effectiveTotal,
  committedTotal,
  committedLiabilities,
  safeToSpend,
}: SafeToSpendBreakdownBarProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  if (effectiveTotal <= 0) {
    return null;
  }

  const segments = [
    { key: 'committed', share: committedTotal, color: theme.warning },
    { key: 'liabilities', share: committedLiabilities, color: theme.error },
    { key: 'safe', share: safeToSpend, color: theme.primary },
  ].filter(segment => segment.share > 0);

  if (segments.length === 0) {
    return null;
  }

  const bar = (
    <Box
      testID="safe-to-spend-breakdown-bar"
      background="pureInverse"
      backgroundOpacity="active"
      height={10}
      borderRadius="full"
      flexDirection="row"
      overflow="hidden"
    >
      {segments.map(segment => (
        <Box
          key={segment.key}
          height="100%"
          flex={segment.share}
          unsafe_backgroundRaw={segment.color}
        />
      ))}
    </Box>
  );

  if (reduceMotion) {
    return bar;
  }

  return (
    <MotiView
      from={{ opacity: 0, scale: ChromeMotion.panelFromScale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={ChromeMotion.sheetSpring}
    >
      {bar}
    </MotiView>
  );
};
