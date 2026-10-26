import { AccountActivitySection } from '@/src/features/accounts/components/AccountActivitySection';
import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import type { AccountDetailsListHeaderModel } from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

type AccountDetailsListHeaderProps = AccountDetailsListHeaderModel & {
  showActivity?: boolean;
  showActivityChart?: boolean;
  onSummaryLayout?: () => void;
  onActivityLayout?: () => void;
};

export function AccountDetailsListHeader({
  summary,
  activity,
  currencyCode,
  showActivity = true,
  showActivityChart = true,
  onSummaryLayout,
  onActivityLayout,
}: AccountDetailsListHeaderProps) {
  return (
    <View style={styles.headerListRegion}>
      <AccountSummaryCard {...summary} currencyCode={currencyCode} onLayout={onSummaryLayout} />
      {showActivity ? (
        <AccountActivitySection
          {...activity}
          accountType={summary.accountType}
          accountColor={summary.accountColor}
          currencyCode={currencyCode}
          showChart={showActivityChart}
          onLayout={onActivityLayout}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerListRegion: {
    paddingVertical: Spacing.md,
  },
});
