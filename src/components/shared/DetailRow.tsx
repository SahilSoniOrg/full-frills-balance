import type { ReactNode } from 'react';
import { AppText, ListRow } from '@/src/components/core';
import { Size } from '@/src/constants';

/** Label on the left, value on the right; both wrap rather than truncate at large text sizes. */
export function DetailRow({
  label,
  value,
  selectable,
  showSeparator,
  onLongPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  value: ReactNode;
  selectable?: boolean;
  showSeparator?: boolean;
  onLongPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <ListRow
      title={<AppText color="secondary">{label}</AppText>}
      trailing={
        typeof value === 'string' || typeof value === 'number' ? (
          <AppText selectable={selectable} align="right">
            {value}
          </AppText>
        ) : (
          value
        )
      }
      trailingMaxWidth="60%"
      minHeight={Size.touchTargetLg}
      showSeparator={showSeparator}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
