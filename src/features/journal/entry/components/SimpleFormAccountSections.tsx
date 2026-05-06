import { Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AccountTileList } from '@/src/features/journal/components/AccountTileList';
import { AccountId, AccountRole as DomainAccountRole } from '@/src/types/domain';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SimpleFormAccountSectionsProps {
  sections: {
    title: string;
    accounts: Account[];
    selectedId: AccountId;
    onSelect: (id: AccountId) => void;
    role: 'source' | 'destination';
  }[];
  onSearchRequest: (role: DomainAccountRole) => void;
}

export function SimpleFormAccountSections({
  sections,
  onSearchRequest,
}: SimpleFormAccountSectionsProps) {
  return (
    <View style={styles.accountSectionStack}>
      {sections.map(section => (
        <View key={section.title} style={styles.accountSection}>
          <AccountTileList
            title={section.title}
            accounts={section.accounts}
            selectedId={section.selectedId}
            onSelect={section.onSelect}
            onSearchRequest={() => onSearchRequest(section.role)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  accountSectionStack: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  accountSection: {
    paddingVertical: Spacing.sm,
  },
});
