import { AccountActivitySection } from '@/src/features/accounts/components/AccountActivitySection';
import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import type {
  AccountActivitySectionModel,
  AccountSummaryCardModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export interface AccountDetailsListHeaderProps {
  summary: AccountSummaryCardModel;
  activity: AccountActivitySectionModel;
}

export function AccountDetailsListHeader({ summary, activity }: AccountDetailsListHeaderProps) {
  return (
    <View style={styles.headerListRegion}>
      <AccountSummaryCard {...summary} />
      <AccountActivitySection {...activity} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerListRegion: {
    paddingVertical: Spacing.md,
  },
});
