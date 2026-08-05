import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { IconButton, InlineSearchField } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';

export type AccountsListHeaderActionsProps = {
  isSearching: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  onReorderPress: () => void;
  onManageHierarchy: () => void;
};

export function AccountsListHeaderActions({
  isSearching,
  searchQuery,
  onSearchChange,
  setIsSearching,
  onReorderPress,
  onManageHierarchy,
}: AccountsListHeaderActionsProps) {
  return (
    <View style={[styles.headerActions, isSearching && styles.headerActionsSearchActive]}>
      {!isSearching ? (
        <>
          <IconButton
            name="reorder"
            size={Size.iconSm}
            variant="surface"
            onPress={onReorderPress}
            accessibilityLabel="Reorder accounts"
          />
          <IconButton
            name="hierarchy"
            size={Size.iconSm}
            variant="surface"
            onPress={onManageHierarchy}
            accessibilityLabel="Manage hierarchy"
          />
        </>
      ) : null}
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
