import type { ReactNode } from 'react';
import { AppText, ListRow } from '@/src/components/core';
import { Size } from '@/src/constants';

/** Label on the left, value on the right; both wrap rather than truncate at large text sizes. */
export function DetailRow({
  label,
  value,
  selectable,
  onLongPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  value: ReactNode;
  selectable?: boolean;
  onLongPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <ListRow
      title={<AppText color="secondary">{label}</AppText>}
      trailing={
        typeof value === 'string' || typeof value === 'number' ? (
          <ListRow.Value color={undefined} selectable={selectable}>
            {value}
          </ListRow.Value>
        ) : (
          value
        )
      }
      trailingMaxWidth="60%"
      minHeight={Size.touchTargetLg}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
