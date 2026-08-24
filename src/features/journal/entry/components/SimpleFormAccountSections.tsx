import { AppConfig, Spacing } from '@/src/constants';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountTileList } from '@/src/features/journal/components/AccountTileList';
import { AccountId } from '@/src/types/ids';
import { AccountRole as DomainAccountRole } from '@/src/types/domainJournal';
import { StyleSheet, View } from 'react-native';

interface SimpleFormAccountSectionsProps {
  sections: {
    title: string;
    accounts: AccountFields[];
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
        <View key={section.role} style={styles.accountSection}>
          <AccountTileList
            title={section.title}
            accounts={section.accounts}
            selectedId={section.selectedId}
            onSelect={section.onSelect}
            onSearchRequest={() => onSearchRequest(section.role)}
            browseAllTestID={`journal-browse-${section.role}`}
            emptyPrompt={
              section.role === 'destination'
                ? AppConfig.strings.transactionFlow.simpleEntry.chooseCategory
                : AppConfig.strings.transactionFlow.simpleEntry.chooseAccount
            }
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
