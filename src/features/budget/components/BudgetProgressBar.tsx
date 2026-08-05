import { ColorKey } from '@/src/constants';
import { Box } from '@/src/design-system';

interface BudgetProgressBarProps {
  progress: number;
  statusColor: ColorKey;
  /** List cards use a slightly taller bar for readability. */
  size?: 'sm' | 'md';
}

export function BudgetProgressBar({ progress, statusColor, size = 'sm' }: BudgetProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const height = size === 'md' ? 8 : 6;

  return (
    <Box height={height} background="surfaceSecondary" borderRadius="full" overflow="hidden">
      <Box
        height="100%"
        width={`${clampedProgress}%`}
        background={statusColor}
        borderRadius="full"
      />
    </Box>
  );
}
