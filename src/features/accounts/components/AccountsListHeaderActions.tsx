import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { ShowArchivedButton } from '@/src/features/accounts/components/ShowArchivedButton';
import { IconButton, InlineSearchField } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

type ArchiveAccountRef = { archivedAt?: Date | number | null };

export type AccountsListHeaderActionsProps = {
  isSearching: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  onManageHierarchy: () => void;
  accountsForArchiveToggle: readonly ArchiveAccountRef[];
};

export function AccountsListHeaderActions({
  isSearching,
  searchQuery,
  onSearchChange,
  setIsSearching,
  onManageHierarchy,
  accountsForArchiveToggle,
}: AccountsListHeaderActionsProps) {
  return (
    <View style={[styles.headerActions, isSearching && styles.headerActionsSearchActive]}>
      {!isSearching ? (
        <>
          <IconButton
            name="hierarchy"
            size={Size.iconSm}
            variant="surface"
            onPress={onManageHierarchy}
            accessibilityLabel="Manage hierarchy"
          />
        </>
      ) : null}
      <ShowArchivedButton accounts={accountsForArchiveToggle} />
      <InlineSearchField
        value={searchQuery}
        onChangeText={onSearchChange}
        onExpandChange={setIsSearching}
        placeholder="Search accounts..."
      />
      {!isSearching ? <PrivacyToggleButton /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerActionsSearchActive: {
    flex: 1,
  },
});
