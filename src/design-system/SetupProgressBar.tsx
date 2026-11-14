import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { Box, Inline } from '@/src/design-system';
import { MotiView } from 'moti';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface SetupProgressBarProps {
  readonly label?: string;
  readonly current: number;
  readonly total: number;
  readonly valueLabel?: string;
  readonly accessibilityLabel?: string;
  readonly accessibilityValueText?: string;
}

export function SetupProgressBar({
  label,
  current,
  total,
  valueLabel,
  accessibilityLabel,
  accessibilityValueText,
}: SetupProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const safeTotal = Math.max(1, total);
  const boundedCurrent = Math.max(0, Math.min(current, safeTotal));
  const ratio = boundedCurrent / safeTotal;
  const resolvedValueLabel = valueLabel ?? `${boundedCurrent} of ${safeTotal}`;
  const showValue = valueLabel !== undefined || label !== undefined;
  const resolvedAccessibilityLabel = accessibilityLabel ?? label ?? 'Progress';
  const resolvedAccessibilityValueText =
    accessibilityValueText ?? (label ? `${boundedCurrent} of ${safeTotal}` : resolvedValueLabel);

  return (
    <Box
      accessibilityRole="progressbar"
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: safeTotal,
        now: boundedCurrent,
        text: resolvedAccessibilityValueText,
      }}
    >
      {label || showValue ? (
        <Inline align="center" justify="space-between" marginBottom="sm">
          {label ? (
            <AppText variant="body" color="secondary" weight="medium">
              {label}
            </AppText>
          ) : null}
          {showValue ? (
            <AppText variant="body" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
              {resolvedValueLabel}
            </AppText>
          ) : null}
        </Inline>
      ) : null}
      <Box height={Spacing.xs} borderRadius="full" background="border" overflow="hidden">
        {reduceMotion ? (
          <Box
            height="100%"
            width={`${ratio * 100}%`}
            borderRadius="full"
            background="primary"
          />
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

const styles = StyleSheet.create({});
