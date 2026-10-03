import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Accounts keep their width; the timestamp wraps instead of squeezing them. */
export function JournalEntryFooterRow({
  children,
  timestamp,
}: {
  children?: ReactNode;
  timestamp?: string;
}) {
  return (
    <View style={styles.row}>
      {children != null && <View style={styles.content}>{children}</View>}
      {timestamp != null && (
        <View style={styles.timestamp}>
          <AppText variant="caption" color="secondary" align="right">
            {timestamp}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
  },
  content: { maxWidth: '100%', flexShrink: 0 },
  timestamp: {
    marginLeft: 'auto',
    maxWidth: '100%',
    paddingVertical: Spacing.xs,
  },
});
