import {
  AppButton,
  AppCard,
  AppInputField,
  AppText,
  AppToggle,
  Badge,
  EmptyStateView,
  InlineSearchField,
  ListRow,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { ModalHost } from '@/src/components/overlays/ModalHost';
import { Spacing } from '@/src/constants/design-tokens';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { usePeopleListViewModel } from '../hooks/usePeopleListViewModel';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import { ScrollView, StyleSheet, View } from 'react-native';

const chrome: TabScreenChrome = { kind: 'tab', screenTitle: 'People' };
export function PeopleListScreen() {
  const vm = usePeopleListViewModel();
  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.content}>
        <View style={styles.actions}>
          <AppButton onPress={vm.openCreate}>Add person</AppButton>
          <AppButton variant="secondary" onPress={vm.openLink}>
            Link existing account
          </AppButton>
        </View>
        <InlineSearchField
          value={vm.query}
          onChangeText={vm.setQuery}
          placeholder="Search people"
        />
        <View style={styles.toggle}>
          <AppText>Show archived</AppText>
          <AppToggle
            value={vm.includeArchived}
            onValueChange={vm.setIncludeArchived}
            accessibilityLabel="Show archived"
          />
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {vm.people.length === 0 ? (
            <EmptyStateView
              title="No people yet"
              subtitle="Add a person to track shared balances."
              primaryActionLabel="Add person"
              onPrimaryAction={vm.openCreate}
            />
          ) : (
            vm.people.map(row => (
              <AppCard key={row.person.id}>
                <ListRow
                  title={row.person.name}
                  onPress={() => AppNavigation.toPersonDetails(row.person.id)}
                >
                  <View style={styles.balance}>
                    <PersonBalanceBadge
                      summary={row.balanceSummary}
                      personName={row.person.name}
                      formatAmount={(amount, currencyCode) =>
                        formatMoneyAmount(amount, currencyCode, false)
                      }
                    />
                    {row.hasNegativeUnassignedRemainder && (
                      <Badge size="sm">
                        <AppText>Negative remainder</AppText>
                      </Badge>
                    )}
                  </View>
                </ListRow>
              </AppCard>
            ))
          )}
        </ScrollView>
      </View>
      <ModalHost
        visible={vm.modal !== null}
        transparent
        animationType="slide"
        onRequestClose={vm.closeModal}
      >
        <View style={styles.backdrop}>
          <AppCard style={styles.modal}>
            <AppText variant="subheading">
              {vm.modal === 'create' ? 'Add person' : 'Link existing account'}
            </AppText>
            {vm.modal === 'create' ? (
              <AppInputField
                value={vm.personName}
                onChangeText={vm.setPersonName}
                placeholder="Person name"
              />
            ) : (
              <>
                <AppText>Select an unlinked account</AppText>
                {vm.accounts.map(account => (
                  <ListRow
                    key={account.id}
                    title={account.name}
                    subtitle={`${account.accountType} · ${account.currencyCode}`}
                    onPress={() => vm.setSelectedAccountId(account.id)}
                    trailing={
                      vm.selectedAccountId === account.id ? <AppText>Selected</AppText> : undefined
                    }
                  />
                ))}
                <AppText>Link to an existing person</AppText>
                {vm.people.map(person => (
                  <ListRow
                    key={person.person.id}
                    title={person.person.name}
                    onPress={() => vm.setSelectedPersonId(person.person.id)}
                    trailing={
                      vm.selectedPersonId === person.person.id ? (
                        <AppText>Selected</AppText>
                      ) : undefined
                    }
                  />
                ))}
                <AppText>Or create a person</AppText>
                <AppInputField
                  value={vm.personName}
                  onChangeText={vm.setPersonName}
                  placeholder="New person name"
                />
              </>
            )}
            <View style={styles.actions}>
              <AppButton variant="secondary" onPress={vm.closeModal}>
                Cancel
              </AppButton>
              <AppButton
                loading={vm.busy}
                onPress={() => {
                  void (vm.modal === 'create' ? vm.addPerson() : vm.linkAccount()).catch(() =>
                    toast.error('Could not save person changes'),
                  );
                }}
              >
                {vm.modal === 'create' ? 'Save' : 'Link account'}
              </AppButton>
            </View>
          </AppCard>
        </View>
      </ModalHost>
    </ScreenWithChrome>
  );
}
const styles = StyleSheet.create({
  content: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { gap: Spacing.sm },
  balance: { gap: Spacing.xs },
  backdrop: { flex: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: '#0008' },
  modal: { gap: Spacing.md, maxHeight: '90%' },
});
