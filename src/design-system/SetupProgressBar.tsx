import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { Box } from './Box';
import { MotiView } from 'moti';

export interface SetupProgressBarProps {
  readonly label: string;
  readonly current: number;
  readonly total: number;
}

export function SetupProgressBar({ label, current, total }: SetupProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const safeTotal = Math.max(1, total);
  const boundedCurrent = Math.max(1, Math.min(current, safeTotal));
  const ratio = boundedCurrent / safeTotal;

  return (
    <Box
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label.split(' · ').at(-1) ?? label}
      accessibilityValue={{
        min: 1,
        max: safeTotal,
        now: boundedCurrent,
      }}
    >
      <Box
        marginBottom="sm"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppText variant="body" color="secondary" weight="medium">
          {label}
        </AppText>
      </Box>
      <Box height={Spacing.xs} borderRadius="full" background="border" overflow="hidden">
        {reduceMotion ? (
          <Box height="100%" width={`${ratio * 100}%`} borderRadius="full" background="primary" />
        ) : (
          <MotiView
            animate={{ width: `${ratio * 100}%` }}
            transition={{ type: 'timing', duration: 320 }}
            style={{ height: '100%', borderRadius: 999, overflow: 'hidden' }}
          >
            <Box height="100%" width="100%" borderRadius="full" background="primary" />
          </MotiView>
        )}
      </Box>
    </Box>
  );
}
