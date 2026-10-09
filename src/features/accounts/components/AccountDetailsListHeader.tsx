import { AccountActivitySection } from '@/src/features/accounts/components/AccountActivitySection';
import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import type { AccountDetailsListHeaderModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export function AccountDetailsListHeader({
  summary,
  activity,
  currencyCode,
}: AccountDetailsListHeaderModel) {
  return (
    <View style={styles.headerListRegion}>
      <AccountSummaryCard {...summary} currencyCode={currencyCode} />
      <AccountActivitySection
        {...activity}
        accountType={summary.accountType}
        accountColor={summary.accountColor}
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
