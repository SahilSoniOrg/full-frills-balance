import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { IconButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { AppNavigation } from '@/src/utils/navigation';
import type { DateRange } from '@/src/utils/dateUtils';
import { StyleSheet, View } from 'react-native';

export type JournalListHeaderActionsProps = {
  dateRange: DateRange | null;
  showDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
};

export function JournalListHeaderActions({
  dateRange,
  showDatePicker,
  navigatePrevious,
  navigateNext,
}: JournalListHeaderActionsProps) {
  return (
    <View style={styles.headerActions}>
      <PrivacyToggleButton />
      <IconButton
        name="reports"
        size={Size.iconSm}
        variant="surface"
        onPress={AppNavigation.toReports}
        accessibilityLabel="View Analytics"
      />
      <IconButton
        name="search"
        size={Size.iconSm}
        variant="surface"
        onPress={() => AppNavigation.toJournalSearch()}
        accessibilityLabel="Search and Filter"
      />
      <DateRangeFilter
        range={dateRange}
        onPress={showDatePicker}
        onPrevious={navigatePrevious}
        onNext={navigateNext}
        showNavigationArrows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
