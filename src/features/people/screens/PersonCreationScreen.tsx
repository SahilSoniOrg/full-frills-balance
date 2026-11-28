import {
  AppButton,
  AppCard,
  AppIcon,
  AppInputField,
  type AppInputFieldProps,
  AppText,
  Badge,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { AccountListRow } from '@/src/components/accounts/AccountListRow';
import { AccountPickerModal } from '@/src/components/account-selection';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { CurrencyPickerSheet } from '@/src/components/shared/CurrencyPickerSheet';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { FormRow, UnderlineNameField } from '@/src/components/forms';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { Inline, Stack } from '@/src/design-system';
import { usePersonCreationViewModel } from '@/src/features/people/hooks/usePersonCreationViewModel';
import type { IconName } from '@/src/types/domainIcons';
import { StyleSheet, View } from 'react-native';

type InlineFieldRowProps = {
  icon: IconName;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  testID?: string;
} & Omit<
  AppInputFieldProps,
  'variant' | 'value' | 'onChangeText' | 'placeholder' | 'multiline' | 'testID'
>;

function InlineFieldRow({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  testID,
  ...inputProps
}: InlineFieldRowProps) {
  return (
    <ListRow
      icon={icon}
      wrap={multiline}
      title={
        <View style={[styles.inlineFieldRow, multiline && styles.inlineFieldRowMultiline]}>
          <AppText
            variant="bodySmall"
            color="secondary"
            weight="medium"
            style={[styles.inlineFieldLabel, multiline && styles.inlineMultilineLabel]}
          >
            {label}
          </AppText>
          <View style={styles.inlineFieldControl}>
            <AppInputField
              variant="minimal"
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              multiline={multiline}
              numberOfLines={multiline ? 3 : undefined}
              testID={testID}
              inputStyle={[styles.inlineInput, multiline && styles.inlineMultilineInput]}
              {...inputProps}
            />
          </View>
        </View>
      }
    />
  );
}

export function PersonCreationScreen() {
  const vm = usePersonCreationViewModel();

  if (vm.isLoading) {
    return (
      <EntityFormScreen
        chrome={vm.chrome}
        submitAction={{
          onPress: () => {},
          label: vm.isEdit ? 'Save changes' : 'Add person',
          disabled: true,
        }}
      >
        <LoadingView loading />
      </EntityFormScreen>
    );
  }

  return (
    <EntityFormScreen
      chrome={vm.chrome}
      submitAction={{
        onPress: () => void vm.savePerson(),
        label: vm.isEdit ? 'Save changes' : 'Add person',
        disabled: vm.isSaveDisabled,
        requirementHint: vm.requirementHint,
      }}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View style={styles.contentColumn}>
        <Stack gap="lg" paddingBottom="xl">
          <AppCard padding="lg" radius="xxl" elevation="sm">
            <Stack gap="lg">
              <Stack gap="md" alignItems="center">
                <PressScaleTouchable
                  onPress={vm.openAppearancePicker}
                  accessibilityRole="button"
                  accessibilityLabel="Change person appearance"
                  testID="person-appearance-button"
                >
                  <View style={styles.avatarTrigger}>
                    <PersonAvatar
                      name={vm.trimmedName || '?'}
                      icon={vm.icon}
                      color={vm.color || undefined}
                      size={76}
                    />
                    <View
                      style={[
                        styles.avatarBadge,
                        { backgroundColor: vm.theme.surface, borderColor: vm.theme.border },
                      ]}
                    >
                      <AppIcon name={Icon.Edit} size={Size.xs} color={vm.theme.primary} />
                    </View>
                  </View>
                </PressScaleTouchable>

                <View style={styles.nameField}>
                  <UnderlineNameField
                    value={vm.name}
                    onChangeText={vm.setName}
                    placeholder="Name (e.g. Pri)"
                    autoFocus={!vm.isEdit}
                    testID="person-name-input"
                  />
                </View>

                {vm.duplicatePerson ? (
                  <AppText
                    variant="caption"
                    color="error"
                    align="center"
                    accessibilityRole="alert"
                    testID="person-duplicate-warning"
                  >
                    {vm.duplicatePerson.archived
                      ? `Archived profile "${vm.duplicatePerson.personName}" already uses this name.`
                      : `"${vm.duplicatePerson.personName}" already exists in this workplace.`}
                  </AppText>
                ) : vm.isPinned || vm.defaultCurrencyCode ? (
                  <Inline gap="xs" alignItems="center">
                    {vm.isPinned ? (
                      <Badge size="sm" variant="primary" icon={Icon.Star}>
                        Pinned
                      </Badge>
                    ) : null}
                    {vm.defaultCurrencyCode ? (
                      <Badge size="sm">{vm.defaultCurrencyCode}</Badge>
                    ) : null}
                  </Inline>
                ) : null}
              </Stack>
            </Stack>
          </AppCard>

          <ListGroup header="LEDGER & PAYMENT">
            <InlineFieldRow
              icon={Icon.Wallet}
              label="Payment ID"
              value={vm.paymentHandle}
              onChangeText={vm.setPaymentHandle}
              placeholder="UPI ID, @handle, or IBAN"
              autoCapitalize="none"
              testID="person-payment-handle-input"
            />
            <FormRow
              icon={Icon.Transaction}
              title="Currency"
              value={vm.defaultCurrencyCode || undefined}
              placeholder={`${vm.workplaceCurrency} (default)`}
              onPress={() => vm.setCurrencyPickerOpen(true)}
              onClear={vm.defaultCurrencyCode ? () => vm.setDefaultCurrencyCode('') : undefined}
              testID="person-currency-row"
            />
            <ListRow
              icon={Icon.Star}
              title="Pin to top"
              subtitle="Show first in People and quick splits"
              accessibilityLabel="Pin to top"
              testID="person-pinned-row"
              trailing={<ListRow.Toggle value={vm.isPinned} onValueChange={vm.setIsPinned} />}
            />
            {!vm.isEdit && vm.linkableAccounts.length > 0 ? (
              <FormRow
                icon={Icon.Bank}
                title="Link account"
                value={
                  vm.selectedAccount
                    ? `${vm.selectedAccount.name} (${vm.selectedAccount.currencyCode})`
                    : undefined
                }
                placeholder="Auto-create on first split"
                onPress={() => vm.setAccountPickerOpen(true)}
                onClear={vm.initialAccountId ? () => vm.setInitialAccountId('') : undefined}
                testID="person-initial-account-row"
              />
            ) : null}
          </ListGroup>

          {vm.isEdit ? (
            <ListGroup
              header="LINKED ACCOUNTS"
              headerAccessory={
                vm.linkableAccounts.length > 0 ? (
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onPress={() => vm.setAccountPickerOpen(true)}
                    disabled={vm.isLinkingAccount}
                    testID="person-edit-link-account-button"
                  >
                    Link account
                  </AppButton>
                ) : undefined
              }
            >
              {vm.linkedAccounts.length === 0 ? (
                <ListRow
                  icon={Icon.Bank}
                  title="No accounts linked"
                  subtitle={
                    vm.linkableAccounts.length > 0
                      ? 'Map an existing ledger account to this person'
                      : 'Create or split to auto-create person accounts'
                  }
                  chevron={vm.linkableAccounts.length > 0}
                  onPress={
                    vm.linkableAccounts.length > 0 ? () => vm.setAccountPickerOpen(true) : undefined
                  }
                  testID="person-edit-empty-linked-accounts"
                />
              ) : (
                vm.linkedAccounts.map(account => (
                  <AccountListRow
                    key={account.id}
                    item={account}
                    testID={`person-edit-linked-account-${account.id}`}
                    trailingAccessory={
                      <IconButton
                        name={Icon.Close}
                        size={Size.iconSm}
                        variant="clear"
                        accessibilityLabel={`Unlink ${account.name}`}
                        onPress={() => vm.onUnlinkAccount(account.id)}
                        disabled={vm.isLinkingAccount}
                        testID={`person-edit-unlink-account-${account.id}`}
                      />
                    }
                  />
                ))
              )}
            </ListGroup>
          ) : null}

          {vm.showMoreDetails ? (
            <ListGroup
              header="CONTACT & NOTES"
              headerAccessory={
                !vm.hasSecondaryValues ? (
                  <AppButton variant="ghost" size="sm" onPress={() => vm.setShowMoreDetails(false)}>
                    Hide
                  </AppButton>
                ) : undefined
              }
            >
              <InlineFieldRow
                icon={Icon.MessageCircle}
                label="Phone"
                value={vm.phone}
                onChangeText={vm.setPhone}
                placeholder="Optional phone number"
                keyboardType="phone-pad"
                testID="person-phone-input"
              />
              <InlineFieldRow
                icon={Icon.Mail}
                label="Email"
                value={vm.email}
                onChangeText={vm.setEmail}
                placeholder="Optional email address"
                keyboardType="email-address"
                autoCapitalize="none"
                testID="person-email-input"
              />
              <InlineFieldRow
                icon={Icon.Document}
                label="Notes"
                value={vm.notes}
                onChangeText={vm.setNotes}
                placeholder="Split rules, flatmate notes, or reminders"
                multiline
                testID="person-notes-input"
              />
            </ListGroup>
          ) : (
            <ListGroup>
              <ListRow
                icon={Icon.Plus}
                title="Add contact info & notes"
                subtitle="Phone, email, or reminder notes"
                chevron
                onPress={() => vm.setShowMoreDetails(true)}
                testID="person-expand-details-button"
              />
            </ListGroup>
          )}
        </Stack>
      </View>

      <CurrencyPickerSheet
        visible={vm.currencyPickerOpen}
        title="Preferred currency"
        currencies={vm.currencies}
        selectedCurrency={vm.defaultCurrencyCode || vm.workplaceCurrency}
        onClose={() => vm.setCurrencyPickerOpen(false)}
        onSelect={code => {
          vm.setDefaultCurrencyCode(code);
          vm.setCurrencyPickerOpen(false);
        }}
      />

      <AccountPickerModal
        visible={vm.accountPickerOpen}
        accounts={vm.linkableAccounts}
        selectedId={!vm.isEdit ? vm.initialAccountId || undefined : undefined}
        title="Link existing account"
        onClose={() => vm.setAccountPickerOpen(false)}
        onSelect={vm.onAccountPickerSelect}
      />
    </EntityFormScreen>
  );
}

const styles = StyleSheet.create({
  contentColumn: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  avatarTrigger: {
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameField: {
    width: '100%',
    maxWidth: 320,
  },
  inlineFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  inlineFieldRowMultiline: {
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  inlineFieldLabel: {
    width: 96,
  },
  inlineMultilineLabel: {
    paddingTop: 2,
  },
  inlineFieldControl: {
    flex: 1,
    minWidth: 0,
  },
  inlineInput: {
    paddingVertical: 0,
    fontSize: Typography.sizes.base,
  },
  inlineMultilineInput: {
    minHeight: 56,
    paddingTop: 0,
    textAlignVertical: 'top',
  },
});
