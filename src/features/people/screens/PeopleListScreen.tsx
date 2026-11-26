import {
  AppButton,
  AppCard,
  AppIcon,
  AppInputField,
  AppText,
  AppToggle,
  Badge,
  EmptyStateView,
  Icon,
  IconTile,
  InlineSearchField,
  ListGroup,
  ListRow,
  PersonAvatar,
} from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { ActionButtonPair } from '@/src/components/shared/ActionButtonPair';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Stack } from '@/src/design-system';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { ScrollView, StyleSheet } from 'react-native';
import { PersonBalanceBadge } from '../components/PersonBalanceBadge';
import { usePeopleListViewModel } from '../hooks/usePeopleListViewModel';

const chrome: TabScreenChrome = { kind: 'tab', screenTitle: 'People' };

export function PeopleListScreen() {
  const vm = usePeopleListViewModel();
  const isPrivacyMode = useEffectivePrivacyMode();

  const handleAddPerson = async () => {
    try {
      await vm.addPerson();
      toast.success('Person added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add person.');
    }
  };

  const handleLinkAccount = async () => {
    try {
      await vm.linkAccount();
      toast.success('Account linked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link account.');
    }
  };

  return (
    <ScreenWithChrome chrome={chrome} scrollable={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Stack gap="lg">
          <AppCard variant="secondary" padding="md" radius="xxl">
            <Stack gap="md">
              <Inline justifyContent="space-between" alignItems="center" gap="sm">
                <Stack gap="xs" flex={1}>
                  <AppText variant="subheading" fontRole="display">
                    Shared Books
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Track shared bills, personal IOUs, and linked accounts.
                  </AppText>
                </Stack>
                <IconTile icon={Icon.Handshake} tint="primary" size="lg" shape="circle" />
              </Inline>
              <ActionButtonPair
                primary={{ label: 'Add person', onPress: vm.openCreate }}
                secondary={{ label: 'Link existing account', onPress: vm.openLink }}
              />
            </Stack>
          </AppCard>

          <Stack gap="sm">
            <InlineSearchField
              value={vm.query}
              onChangeText={vm.setQuery}
              placeholder="Search people"
            />
            <Inline justifyContent="space-between" alignItems="center" paddingHorizontal="xs">
              <AppText variant="caption" color="secondary">
                Show archived
              </AppText>
              <AppToggle
                value={vm.includeArchived}
                onValueChange={vm.setIncludeArchived}
                accessibilityLabel="Show archived"
              />
            </Inline>
          </Stack>

          {vm.people.length === 0 ? (
            <EmptyStateView
              title="No people yet"
              subtitle="Add a person to track shared balances."
              icon={Icon.User}
              primaryActionLabel="Add person"
              onPrimaryAction={vm.openCreate}
            />
          ) : (
            <ListGroup header={`PEOPLE (${vm.people.length})`}>
              {vm.people.map(row => (
                <ListRow
                  key={row.person.id}
                  leading={<PersonAvatar name={row.person.name} size={44} />}
                  title={
                    <Inline gap="sm" alignItems="center" flexWrap="wrap">
                      <AppText variant="body" weight="semibold">
                        {row.person.name}
                      </AppText>
                      {row.person.archivedAt ? <Badge size="sm">Archived</Badge> : null}
                      {row.hasNegativeUnassignedRemainder ? (
                        <Badge size="sm" variant="warning">
                          Negative remainder
                        </Badge>
                      ) : null}
                    </Inline>
                  }
                  subtitle={
                    <PersonBalanceBadge
                      summary={row.balanceSummary}
                      personName={row.person.name}
                      compact
                      formatAmount={(amount, currencyCode) =>
                        formatMoneyAmount(amount, currencyCode, isPrivacyMode)
                      }
                    />
                  }
                  chevron
                  wrap
                  onPress={() => AppNavigation.toPersonDetails(row.person.id)}
                />
              ))}
            </ListGroup>
          )}
        </Stack>
      </ScrollView>

      <ModalSurface
        visible={vm.modal === 'create'}
        title="Add person"
        onClose={vm.closeModal}
        position="center"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={vm.closeModal}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton
                loading={vm.busy}
                disabled={vm.busy}
                onPress={() => void handleAddPerson()}
              >
                Save
              </AppButton>
            </Box>
          </Inline>
        }
      >
        <Stack gap="sm">
          <AppText variant="caption" color="secondary">
            Create an offline ledger profile to split bills, lend, or record repayments.
          </AppText>
          <AppInputField
            placeholder="Person name"
            value={vm.personName}
            onChangeText={vm.setPersonName}
            autoFocus
          />
        </Stack>
      </ModalSurface>

      <ModalSurface
        visible={vm.modal === 'link'}
        title="Link existing account"
        onClose={vm.closeModal}
        position="bottomSheet"
        fixedHeight={false}
        keyboardAvoiding
        footer={
          <Inline gap="sm">
            <Box flex={1}>
              <AppButton variant="outline" onPress={vm.closeModal}>
                Cancel
              </AppButton>
            </Box>
            <Box flex={1}>
              <AppButton
                loading={vm.busy}
                disabled={vm.busy}
                onPress={() => void handleLinkAccount()}
              >
                Save
              </AppButton>
            </Box>
          </Inline>
        }
      >
        <Stack gap="lg">
          <ListGroup header="1. SELECT UNLINKED ACCOUNT">
            {vm.accounts.length === 0 ? (
              <ListRow title="No unlinked compatible accounts" />
            ) : (
              vm.accounts.map(account => (
                <ListRow
                  key={account.id}
                  leading={<IconTile icon={Icon.Bank} tint="asset" />}
                  title={account.name}
                  subtitle={`${account.accountType} · ${account.currencyCode}`}
                  trailing={
                    vm.selectedAccountId === account.id ? (
                      <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                    ) : undefined
                  }
                  onPress={() => vm.setSelectedAccountId(account.id)}
                />
              ))
            )}
          </ListGroup>

          <ListGroup header="2. CHOOSE PERSON OR CREATE NEW">
            {vm.people.map(entry => (
              <ListRow
                key={entry.person.id}
                leading={<PersonAvatar name={entry.person.name} size={32} />}
                title={entry.person.name}
                trailing={
                  vm.selectedPersonId === entry.person.id ? (
                    <AppIcon name={Icon.CheckCircle} size={20} color="primary" />
                  ) : undefined
                }
                onPress={() => vm.setSelectedPersonId(entry.person.id)}
              />
            ))}
          </ListGroup>

          <AppInputField
            placeholder="Or create new person name"
            value={vm.personName}
            onChangeText={vm.setPersonName}
          />
        </Stack>
      </ModalSurface>
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
});
