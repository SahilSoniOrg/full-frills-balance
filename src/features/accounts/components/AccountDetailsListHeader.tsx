import { AccountActivitySection } from '@/src/features/accounts/components/AccountActivitySection';
import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import type { AccountDetailsListHeaderModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export function AccountDetailsListHeader({
  accountType,
  summary,
  activity,
  reconciledAtMs,
  currencyCode,
}: AccountDetailsListHeaderModel) {
  return (
    <View style={styles.headerListRegion}>
      <AccountSummaryCard
        {...summary}
        reconciledAtMs={reconciledAtMs}
        currencyCode={currencyCode}
      />
      <AccountActivitySection
        {...activity}
        accountType={accountType}
        reconciledAtMs={reconciledAtMs}
        currencyCode={currencyCode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerListRegion: {
    paddingVertical: Spacing.md,
  },
});
