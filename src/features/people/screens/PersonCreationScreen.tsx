import {
  AppIcon,
  AppInputField,
  AppText,
  AppToggle,
  Icon,
  IconTile,
  ListGroup,
  ListRow,
  LoadingView,
  PersonAvatar,
} from '@/src/components/core';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import {
  SelectionPickerSheet,
  type SelectionOption,
  type SelectionSection,
} from '@/src/components/filters/SelectionPickerSheet';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { FormRow } from '@/src/components/forms/FormRow';
import { UnderlineNameField } from '@/src/components/forms/UnderlineNameField';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppearancePickerView } from '@/src/components/overlays/AppearancePickerView';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import {
  ACCOUNT_COLOR_PALETTE,
  AppConfig,
  BorderWidth,
  Opacity,
  Shape,
  Size,
  Spacing,
} from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Box, Inline, Stack } from '@/src/design-system';
import { withOpacity } from '@/src/design-system/colorMath';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import { createPerson, peopleReadService, updatePerson } from '@/src/services/people';
import type { AccountId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

const QUICK_COLOR_SWATCHES = [
  '#10B981',
  '#0EA5E9',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F59E0B',
  '#64748B',
] as const;

const POPULAR_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'AED'] as const;

type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];
type PickerPerson = Awaited<ReturnType<typeof peopleReadService.listPersonPickerGroups>>[number];

export function PersonCreationScreen() {
  const { personId } = useLocalSearchParams<{ personId?: PersonId }>();
  const isEdit = Boolean(personId);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const { currencies } = useCurrencies();

  const [isLoading, setIsLoading] = useState(isEdit);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState('');
  const [paymentHandle, setPaymentHandle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [initialAccountId, setInitialAccountId] = useState<AccountId | ''>('');

  const [existingPeople, setExistingPeople] = useState<PickerPerson[]>([]);
  const [linkableAccounts, setLinkableAccounts] = useState<LinkableAccount[]>([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
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
          setColor(profile.color ?? '');
          setDefaultCurrencyCode(profile.defaultCurrencyCode ?? '');
          setPaymentHandle(profile.paymentHandle ?? '');
          setPhone(profile.phone ?? '');
          setEmail(profile.email ?? '');
          setNotes(profile.notes ?? '');
          setIsPinned(Boolean(profile.isPinned));
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
  const isSaveDisabled = !trimmedName || Boolean(duplicatePerson) || isSaving;
  const requirementHint = !trimmedName
    ? 'Enter a person name to continue.'
    : duplicatePerson
      ? `Already exists as "${duplicatePerson.personName}".`
      : undefined;

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
      <Stack gap="lg" paddingBottom="xl">
        <Box paddingHorizontal="lg">
          <Stack gap="sm">
            <SectionLabel label="Identity" marginTop="none" />
            <Inline gap="md" alignItems="center">
              <PressScaleTouchable
                onPress={() => setColorPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose avatar color"
                testID="person-avatar-color-button"
              >
                <View style={styles.avatarTrigger}>
                  <PersonAvatar name={trimmedName || '?'} color={color || undefined} size={56} />
                  <View
                    style={[
                      styles.avatarBadge,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <AppIcon name={Icon.Palette} size={Size.xxs} color="primary" />
                  </View>
                </View>
              </PressScaleTouchable>
              <View style={styles.nameFieldWrap}>
                <UnderlineNameField
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Pri"
                  autoFocus={!isEdit}
                  testID="person-name-input"
                />
              </View>
            </Inline>

            {duplicatePerson ? (
              <AppText
                variant="caption"
                color="error"
                accessibilityRole="alert"
                testID="person-duplicate-warning"
              >
                {duplicatePerson.archived
                  ? `Archived profile "${duplicatePerson.personName}" already uses this name.`
                  : `"${duplicatePerson.personName}" already exists in this workplace.`}
              </AppText>
            ) : (
              <AppText variant="caption" color="secondary">
                {isEdit
                  ? 'Update profile identity, payment handle, or contact preferences.'
                  : 'Create an offline ledger profile to split bills, lend, or record repayments.'}
              </AppText>
            )}

            <Inline gap="sm" alignItems="center" flexWrap="wrap" style={styles.swatchRow}>
              <PressScaleTouchable
                onPress={() => setColor('')}
                accessibilityRole="button"
                accessibilityLabel="Default avatar color"
                accessibilityState={{ selected: !color }}
                style={[
                  styles.autoChip,
                  {
                    backgroundColor: !color
                      ? withOpacity(theme.primary, Opacity.soft)
                      : theme.surfaceSecondary,
                    borderColor: !color ? theme.primary : theme.border,
                  },
                ]}
              >
                <AppText variant="caption" weight={!color ? 'semibold' : 'medium'}>
                  Default
                </AppText>
              </PressScaleTouchable>
              {QUICK_COLOR_SWATCHES.map(swatch => {
                const selected = color.toUpperCase() === swatch.toUpperCase();
                return (
                  <PressScaleTouchable
                    key={swatch}
                    onPress={() => setColor(swatch)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select color ${swatch}`}
                    accessibilityState={{ selected }}
                    style={[
                      styles.swatchDot,
                      {
                        backgroundColor: swatch,
                        borderColor: selected ? theme.text : 'transparent',
                        borderWidth: selected ? BorderWidth.focus : 0,
                      },
                    ]}
                  >
                    {selected ? (
                      <AppIcon name={Icon.Check} size={Size.iconXs} color={theme.background} />
                    ) : null}
                  </PressScaleTouchable>
                );
              })}
              <PressScaleTouchable
                onPress={() => setColorPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="More avatar colors"
                style={[
                  styles.autoChip,
                  { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                ]}
              >
                <AppText variant="caption" color="secondary">
                  More
                </AppText>
              </PressScaleTouchable>
            </Inline>
          </Stack>
        </Box>

        <Box paddingHorizontal="lg">
          <ListGroup header="DETAILS (OPTIONAL)">
            <FormRow
              icon={Icon.Wallet}
              title="Preferred currency"
              value={defaultCurrencyCode || undefined}
              placeholder={`Workplace default (${workplaceCurrency})`}
              onPress={() => setCurrencyPickerOpen(true)}
              onClear={defaultCurrencyCode ? () => setDefaultCurrencyCode('') : undefined}
              testID="person-currency-row"
            />
            <ListRow
              leading={<IconTile icon={Icon.Copy} tint="primary" />}
              title="Payment handle"
              subtitle={
                <AppInputField
                  value={paymentHandle}
                  onChangeText={setPaymentHandle}
                  placeholder="UPI ID, @handle, or IBAN"
                  autoCapitalize="none"
                  testID="person-payment-handle-input"
                />
              }
              wrap
            />
            <ListRow
              leading={<IconTile icon={Icon.MessageCircle} tint="textSecondary" />}
              title="Phone"
              subtitle={
                <AppInputField
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  testID="person-phone-input"
                />
              }
              wrap
            />
            <ListRow
              leading={<IconTile icon={Icon.Mail} tint="textSecondary" />}
              title="Email"
              subtitle={
                <AppInputField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="person-email-input"
                />
              }
              wrap
            />
            <ListRow
              leading={<IconTile icon={Icon.Document} tint="textSecondary" />}
              title="Notes"
              subtitle={
                <AppInputField
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Roommate, trip split rules, or reminders"
                  multiline
                  numberOfLines={3}
                  testID="person-notes-input"
                />
              }
              wrap
            />
            <ListRow
              leading={<IconTile icon={Icon.Star} tint="primary" />}
              title="Pin to top"
              subtitle="Keep near the top of People and quick splits"
              testID="person-pinned-row"
              trailing={
                <AppToggle
                  accessibilityLabel="Pin to top"
                  value={isPinned}
                  onValueChange={setIsPinned}
                />
              }
            />
          </ListGroup>
        </Box>

        {!isEdit && linkableAccounts.length > 0 ? (
          <Box paddingHorizontal="lg">
            <ListGroup header="LINK ACCOUNT (OPTIONAL)">
              <FormRow
                icon={Icon.Bank}
                title="Link existing account"
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
            </ListGroup>
          </Box>
        ) : null}
      </Stack>

      <ModalSurface
        visible={colorPickerOpen}
        title="Avatar color"
        onClose={() => setColorPickerOpen(false)}
        position="bottomSheet"
        fixedHeight={false}
      >
        <AppearancePickerView
          mode="color"
          showTitle={false}
          selectedColor={color || ACCOUNT_COLOR_PALETTE[0]}
          onColorSelect={nextColor => {
            setColor(nextColor);
            setColorPickerOpen(false);
          }}
          onClose={() => setColorPickerOpen(false)}
        />
      </ModalSurface>

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

      <ModalSurface
        visible={accountPickerOpen}
        title="Link existing account"
        onClose={() => setAccountPickerOpen(false)}
        position="bottomSheet"
        fixedHeight={false}
      >
        <ListGroup>
          {linkableAccounts.map(account => (
            <ListRow
              key={account.id}
              leading={<IconTile icon={Icon.Bank} tint="asset" />}
              title={account.name}
              subtitle={`${account.accountType} · ${account.currencyCode}`}
              trailing={
                initialAccountId === account.id ? (
                  <AppIcon name={Icon.CheckCircle} size={Size.iconSm} color="primary" />
                ) : undefined
              }
              onPress={() => {
                setInitialAccountId(account.id);
                setAccountPickerOpen(false);
              }}
            />
          ))}
        </ListGroup>
      </ModalSurface>
    </EntityFormScreen>
  );
}

const styles = StyleSheet.create({
  avatarTrigger: {
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameFieldWrap: {
    flex: 1,
    minWidth: 0,
  },
  swatchRow: {
    paddingTop: Spacing.xs,
  },
  swatchDot: {
    width: 28,
    height: 28,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoChip: {
    height: 28,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
