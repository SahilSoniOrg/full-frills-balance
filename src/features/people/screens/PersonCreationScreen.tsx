import {
  AppButton,
  AppCard,
  AppIcon,
  AppInputField,
  type AppInputFieldProps,
  AppText,
  Badge,
  Icon,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { AccountPickerModal } from '@/src/components/account-selection';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import {
  SelectionPickerSheet,
  type SelectionOption,
  type SelectionSection,
} from '@/src/components/filters/SelectionPickerSheet';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { FormRow } from '@/src/components/forms/FormRow';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { openAppearancePicker } from '@/src/components/overlays/appearancePickerSession';
import { AppConfig, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Inline, Stack } from '@/src/design-system';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import { createPerson, peopleReadService, updatePerson } from '@/src/services/people';
import type { IconName } from '@/src/types/domainIcons';
import type { AccountId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const POPULAR_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'AED'] as const;

type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];
type PickerPerson = Awaited<ReturnType<typeof peopleReadService.listPersonPickerGroups>>[number];

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
  const { personId } = useLocalSearchParams<{ personId?: PersonId }>();
  const isEdit = Boolean(personId);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const { currencies } = useCurrencies();

  const [isLoading, setIsLoading] = useState(isEdit);
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [icon, setIcon] = useState<IconName>(Icon.User);
  const [color, setColor] = useState('');
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState('');
  const [paymentHandle, setPaymentHandle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [initialAccountId, setInitialAccountId] = useState<AccountId | ''>('');
  const [showMoreDetails, setShowMoreDetails] = useState(isEdit);

  const [existingPeople, setExistingPeople] = useState<PickerPerson[]>([]);
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableAccount[]>([]);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [peopleGroups, linkable, profile] = await Promise.all([
          peopleReadService.listPersonPickerGroups(workplaceId),
          isEdit
            ? Promise.resolve([])
            : peopleReadService.listLinkableAccountsForPeople(workplaceId),
          personId
            ? peopleReadService.getPersonProfile(workplaceId, personId)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setExistingPeople(peopleGroups);
        setLinkableAccounts(linkable);
        if (profile) {
          setName(profile.name);
          setIcon(profile.icon ?? Icon.User);
          setColor(profile.color ?? '');
          setDefaultCurrencyCode(profile.defaultCurrencyCode ?? '');
          setPaymentHandle(profile.paymentHandle ?? '');
          setPhone(profile.phone ?? '');
          setEmail(profile.email ?? '');
          setNotes(profile.notes ?? '');
          setIsPinned(Boolean(profile.isPinned));
          setShowMoreDetails(Boolean(profile.phone || profile.email || profile.notes));
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [isEdit, personId, workplaceId]);

  const fingerprint = useMemo(
    () =>
      JSON.stringify({
        name,
        icon,
        color,
        defaultCurrencyCode,
        paymentHandle,
        phone,
        email,
        notes,
        isPinned,
        initialAccountId,
      }),
    [
      color,
      defaultCurrencyCode,
      email,
      icon,
      initialAccountId,
      isPinned,
      name,
      notes,
      paymentHandle,
      phone,
    ],
  );

  const guard = useConfirmUnsavedChanges({
    fingerprint,
    baselineReady: !isLoading,
    shouldConfirm: true,
    disabled: isSaving,
    leaveAfterSave,
    title: isEdit ? 'Discard profile changes?' : 'Discard new person?',
  });

  const duplicatePerson = useMemo(() => {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized) return undefined;
    return existingPeople.find(
      row => row.personId !== personId && row.personName.trim().toLocaleLowerCase() === normalized,
    );
  }, [existingPeople, name, personId]);

  const currencySections = useMemo((): SelectionSection<string>[] => {
    const popularSet = new Set<string>([workplaceCurrency, ...POPULAR_CURRENCY_CODES]);
    if (defaultCurrencyCode) popularSet.add(defaultCurrencyCode);
    const toOption = (currency: (typeof currencies)[number]): SelectionOption<string> => ({
      id: currency.code,
      label: currency.name,
      meta: currency.code,
      keywords: currency.symbol,
      leading: (
        <View style={[styles.currencyBadge, { backgroundColor: theme.surfaceSecondary }]}>
          <AppText
            variant="caption"
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {currency.symbol}
          </AppText>
        </View>
      ),
    });
    const sorted = [...currencies].sort(
      (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
    );
    const popular = sorted.filter(c => popularSet.has(c.code)).map(toOption);
    const rest = sorted.filter(c => !popularSet.has(c.code)).map(toOption);
    return [
      ...(popular.length ? [{ title: 'Popular', data: popular }] : []),
      ...(rest.length ? [{ title: 'All currencies', data: rest }] : []),
    ];
  }, [currencies, defaultCurrencyCode, theme.surfaceSecondary, workplaceCurrency]);

  const selectedAccount = useMemo(
    () => linkableAccounts.find(account => account.id === initialAccountId),
    [initialAccountId, linkableAccounts],
  );

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: isEdit ? 'Edit person' : 'Add person',
      kind: 'nav',
      onBack: guard.onBack,
    }),
    [guard.onBack, isEdit],
  );

  const savePerson = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || duplicatePerson || isSaving) return;

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        icon,
        color: color.trim() || undefined,
        defaultCurrencyCode: defaultCurrencyCode.trim() || undefined,
        paymentHandle: paymentHandle.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
        isPinned,
      };
      if (isEdit && personId) {
        await updatePerson(workplaceId, personId, payload);
        toast.success('Person updated.');
      } else {
        await createPerson(workplaceId, {
          ...payload,
          initialAccountId: initialAccountId || undefined,
        });
        toast.success('Person added.');
      }
      setLeaveAfterSave(() => AppNavigation.back);
    } catch (error) {
      setIsSaving(false);
      toast.error(
        error instanceof Error
          ? error.message
          : isEdit
            ? 'Could not update person.'
            : 'Could not add person.',
      );
    }
  };

  if (isLoading) {
    return (
      <EntityFormScreen
        chrome={chrome}
        submitAction={{
          onPress: () => {},
          label: isEdit ? 'Save changes' : 'Add person',
          disabled: true,
        }}
      >
        <LoadingView loading />
      </EntityFormScreen>
    );
  }

  const trimmedName = name.trim();
  const accentColor = color || theme.primary;
  const isSaveDisabled = !trimmedName || Boolean(duplicatePerson) || isSaving;
  const requirementHint = !trimmedName
    ? 'Enter a person name to continue.'
    : duplicatePerson
      ? `Already exists as "${duplicatePerson.personName}".`
      : undefined;
  const hasSecondaryValues = Boolean(phone.trim() || email.trim() || notes.trim());

  return (
    <EntityFormScreen
      chrome={chrome}
      submitAction={{
        onPress: () => void savePerson(),
        label: isEdit ? 'Save changes' : 'Add person',
        disabled: isSaveDisabled,
        requirementHint,
      }}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      <View style={styles.contentColumn}>
        <Stack gap="lg" paddingBottom="xl">
          <AppCard padding="lg" radius="xxl" elevation="sm">
            <Stack gap="lg">
              <Stack gap="md" alignItems="center">
                <PressScaleTouchable
                  onPress={() =>
                    void openAppearancePicker({
                      mode: 'both',
                      title: 'Person appearance',
                      selectedIcon: icon,
                      selectedColor: color,
                      defaultAccentColor: theme.primary,
                      previewLabel: 'Selected person icon',
                      defaultColorLabel: 'Default color',
                      onIconSelect: setIcon,
                      onColorSelect: setColor,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Change person appearance"
                  testID="person-appearance-button"
                >
                  <View style={styles.avatarTrigger}>
                    <PersonAvatar
                      name={trimmedName || '?'}
                      icon={icon}
                      color={color || undefined}
                      size={76}
                    />
                    <View
                      style={[
                        styles.avatarBadge,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
                    >
                      <AppIcon name={Icon.Edit} size={Size.xs} color={theme.primary} />
                    </View>
                  </View>
                </PressScaleTouchable>

                <View
                  style={[
                    styles.heroNameUnderline,
                    {
                      borderBottomColor: duplicatePerson
                        ? theme.error
                        : nameFocused
                          ? accentColor
                          : theme.border,
                    },
                  ]}
                >
                  <AppInputField
                    variant="minimal"
                    value={name}
                    onChangeText={setName}
                    placeholder="Name (e.g. Pri)"
                    autoFocus={!isEdit}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    testID="person-name-input"
                    inputStyle={styles.heroNameInput}
                  />
                </View>

                {duplicatePerson ? (
                  <AppText
                    variant="caption"
                    color="error"
                    align="center"
                    accessibilityRole="alert"
                    testID="person-duplicate-warning"
                  >
                    {duplicatePerson.archived
                      ? `Archived profile "${duplicatePerson.personName}" already uses this name.`
                      : `"${duplicatePerson.personName}" already exists in this workplace.`}
                  </AppText>
                ) : isPinned || defaultCurrencyCode ? (
                  <Inline gap="xs" alignItems="center">
                    {isPinned ? (
                      <Badge size="sm" variant="primary" icon={Icon.Star}>
                        Pinned
                      </Badge>
                    ) : null}
                    {defaultCurrencyCode ? <Badge size="sm">{defaultCurrencyCode}</Badge> : null}
                  </Inline>
                ) : null}
              </Stack>
            </Stack>
          </AppCard>

          <ListGroup header="LEDGER & PAYMENT">
            <InlineFieldRow
              icon={Icon.Wallet}
              label="Payment ID"
              value={paymentHandle}
              onChangeText={setPaymentHandle}
              placeholder="UPI ID, @handle, or IBAN"
              autoCapitalize="none"
              testID="person-payment-handle-input"
            />
            <FormRow
              icon={Icon.Transaction}
              title="Currency"
              value={defaultCurrencyCode || undefined}
              placeholder={`${workplaceCurrency} (default)`}
              onPress={() => setCurrencyPickerOpen(true)}
              onClear={defaultCurrencyCode ? () => setDefaultCurrencyCode('') : undefined}
              testID="person-currency-row"
            />
            <ListRow
              icon={Icon.Star}
              title="Pin to top"
              subtitle="Show first in People and quick splits"
              accessibilityLabel="Pin to top"
              testID="person-pinned-row"
              trailing={<ListRow.Toggle value={isPinned} onValueChange={setIsPinned} />}
            />
            {!isEdit && linkableAccounts.length > 0 ? (
              <FormRow
                icon={Icon.Bank}
                title="Link account"
                value={
                  selectedAccount
                    ? `${selectedAccount.name} (${selectedAccount.currencyCode})`
                    : undefined
                }
                placeholder="Auto-create on first split"
                onPress={() => setAccountPickerOpen(true)}
                onClear={initialAccountId ? () => setInitialAccountId('') : undefined}
                testID="person-initial-account-row"
              />
            ) : null}
          </ListGroup>

          {showMoreDetails ? (
            <ListGroup
              header="CONTACT & NOTES"
              headerAccessory={
                !hasSecondaryValues ? (
                  <AppButton variant="ghost" size="sm" onPress={() => setShowMoreDetails(false)}>
                    Hide
                  </AppButton>
                ) : undefined
              }
            >
              <InlineFieldRow
                icon={Icon.MessageCircle}
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="Optional phone number"
                keyboardType="phone-pad"
                testID="person-phone-input"
              />
              <InlineFieldRow
                icon={Icon.Mail}
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="Optional email address"
                keyboardType="email-address"
                autoCapitalize="none"
                testID="person-email-input"
              />
              <InlineFieldRow
                icon={Icon.Document}
                label="Notes"
                value={notes}
                onChangeText={setNotes}
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
                onPress={() => setShowMoreDetails(true)}
                testID="person-expand-details-button"
              />
            </ListGroup>
          )}
        </Stack>
      </View>

      <SelectionPickerSheet
        visible={currencyPickerOpen}
        title="Preferred currency"
        sections={currencySections}
        selectedValue={defaultCurrencyCode || workplaceCurrency}
        searchPlaceholder={AppConfig.strings.common.currencySearchPlaceholder}
        emptyMessage={AppConfig.strings.common.currencyEmptySearch}
        showSearch
        onClose={() => setCurrencyPickerOpen(false)}
        onSelect={code => {
          setDefaultCurrencyCode(code);
          setCurrencyPickerOpen(false);
        }}
        accessibilityCloseLabel={AppConfig.strings.common.closeCurrencyPicker}
      />

      <AccountPickerModal
        visible={accountPickerOpen}
        accounts={linkableAccounts}
        selectedId={initialAccountId || undefined}
        title="Link existing account"
        onClose={() => setAccountPickerOpen(false)}
        onSelect={id => {
          setInitialAccountId(id);
          setAccountPickerOpen(false);
        }}
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
  heroNameUnderline: {
    width: '100%',
    maxWidth: 320,
    borderBottomWidth: 1.5,
    paddingBottom: Spacing.xs,
  },
  heroNameInput: {
    textAlign: 'center',
    fontSize: Typography.sizes.xl,
    fontWeight: '600',
    paddingVertical: Spacing.xs,
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
  currencyBadge: {
    width: Size.xl,
    height: Size.xl,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    overflow: 'hidden',
  },
});
