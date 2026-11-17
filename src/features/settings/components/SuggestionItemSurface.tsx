import { AppIcon, Badge } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export function SuggestionItemSurface({
  expanded,
  children,
}: {
  expanded: boolean;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        expanded ? styles.expanded : null,
        { backgroundColor: expanded ? theme.surfaceSecondary : 'transparent' },
      ]}
    >
      {children}
    </View>
  );
}

export function SuggestionAmount({
  amount,
  currencyCode,
  expanded,
}: {
  amount: number;
  currencyCode: string;
  expanded: boolean;
}) {
  return (
    <View style={styles.trailing}>
      <MoneyText amount={amount} currencyCode={currencyCode} />
      {expanded ? (
        <Badge variant="primary" size="sm">
          Open
        </Badge>
      ) : null}
      <AppIcon
        name={expanded ? Icon.ChevronDown : Icon.ChevronRight}
        size={16}
        color="textSecondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  expanded: { marginTop: 6, borderRadius: 12, overflow: 'hidden' },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 5,
    flexShrink: 1,
  },
});
