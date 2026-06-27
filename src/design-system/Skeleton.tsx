import { DimensionValue, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useTheme } from '@/src/hooks/use-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { Box } from './Box';
import { Opacity, RadiusKey } from '@/src/constants/design-tokens';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: RadiusKey | number;
  color?: string;
};

/**
 * Skeleton - Placeholder for loading states
 * Provides a subtle pulse animation using Moti.
 * Respects the system reduced-motion accessibility setting.
 */
export const Skeleton = ({ width = '100%', height = 20, radius = 'sm', color }: SkeletonProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const baseColor = color || theme.surface;

  return (
    <Box
      width={width}
      height={height}
      borderRadius={radius}
      background={baseColor as any}
      style={styles.container}
    >
      {!reduceMotion && (
        <MotiView
          from={{ opacity: Opacity.muted }}
          animate={{ opacity: Opacity.medium }}
          transition={{
            type: 'timing',
            duration: 1000,
            loop: true,
            repeatReverse: true,
          }}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.primary, opacity: Opacity.hover },
          ]}
        />
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
