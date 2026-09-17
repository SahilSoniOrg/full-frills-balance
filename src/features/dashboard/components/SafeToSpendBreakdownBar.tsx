import { ChromeMotion } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import { StyleSheet, View } from 'react-native';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
}

type BarSegment = {
  key: string;
  share: number;
  color: string;
};

/** Stacked STS composition bar — Moti width settle on first paint (skipped under reduce motion). */
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

  const segments: BarSegment[] = [
    { key: 'committed', share: committedTotal, color: theme.warning },
    { key: 'liabilities', share: committedLiabilities, color: theme.error },
    { key: 'safe', share: safeToSpend, color: theme.primary },
  ].filter(segment => segment.share > 0);

  if (segments.length === 0) {
    return null;
  }

  return (
    <View style={styles.track} testID="safe-to-spend-breakdown-bar" accessibilityRole="progressbar">
      <Box
        background="pureInverse"
        backgroundOpacity="active"
        height={10}
        borderRadius="full"
        flexDirection="row"
        overflow="hidden"
      >
        {segments.map(segment => {
          const widthPercent = `${(segment.share / effectiveTotal) * 100}%` as const;
          if (reduceMotion) {
            return (
              <View
                key={segment.key}
                style={[styles.segment, { width: widthPercent, backgroundColor: segment.color }]}
              />
            );
          }
          return (
            <MotiView
              key={segment.key}
              from={{ width: '0%' }}
              animate={{ width: widthPercent }}
              transition={ChromeMotion.sheetSpring}
              style={[styles.segment, { backgroundColor: segment.color }]}
            />
          );
        })}
      </Box>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
  },
  segment: {
    height: '100%',
  },
});
