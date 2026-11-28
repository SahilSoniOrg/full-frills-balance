import { Icon } from '@/src/components/core';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { openAppearancePicker } from '@/src/components/overlays/appearancePickerSession';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { useObservable } from '@/src/hooks/useObservable';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { toast } from '@/src/services/feedback/alerts';
import {
  createPerson,
  linkExistingAccount,
  peopleReadService,
  updatePerson,
} from '@/src/services/people';
import type { IconName } from '@/src/types/domainIcons';
import type { AccountId, PersonId } from '@/src/types/ids';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { of } from 'rxjs';

type LinkableAccount = Awaited<
  ReturnType<typeof peopleReadService.listLinkableAccountsForPeople>
>[number];
type LinkedAccount = NonNullable<
  Awaited<ReturnType<typeof peopleReadService.getPersonDetail>>
>['linkedAccounts'][number]['account'];
type PickerPerson = Awaited<ReturnType<typeof peopleReadService.listPersonPickerGroups>>[number];

export function usePersonCreationViewModel() {
  const { personId } = useLocalSearchParams<{ personId?: PersonId }>();
  const isEdit = Boolean(personId);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { theme } = useTheme();
  const { currencies } = useCurrencies();

  const [isLoading, setIsLoading] = useState(isEdit);
  const [name, setName] = useState('');
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
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);

  const { version: peopleTick } = useObservable(
    () => (isEdit ? peopleReadService.observePeopleTick(workplaceId) : of(null)),
    [isEdit, workplaceId],
    null,
  );

  const refreshLinkedAccounts = useCallback(async () => {
    if (!personId) {
      setLinkedAccounts([]);
      return;
    }
    const [detail, linkable] = await Promise.all([
      peopleReadService.getPersonDetail(workplaceId, personId, workplaceCurrency),
      peopleReadService.listLinkableAccountsForPeople(workplaceId),
    ]);
    setLinkedAccounts(detail?.linkedAccounts.map(linked => linked.account) ?? []);
    setLinkableAccounts(linkable);
  }, [personId, workplaceCurrency, workplaceId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [peopleGroups, profile] = await Promise.all([
          peopleReadService.listPersonPickerGroups(workplaceId),
          personId
            ? peopleReadService.getPersonProfile(workplaceId, personId)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setExistingPeople(peopleGroups);
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
        if (isEdit && personId) {
          const [detail, linkable] = await Promise.all([
            peopleReadService.getPersonDetail(workplaceId, personId, workplaceCurrency),
            peopleReadService.listLinkableAccountsForPeople(workplaceId),
          ]);
          if (!active) return;
          setLinkedAccounts(detail?.linkedAccounts.map(linked => linked.account) ?? []);
          setLinkableAccounts(linkable);
        } else {
          const linkable = await peopleReadService.listLinkableAccountsForPeople(workplaceId);
          if (!active) return;
          setLinkableAccounts(linkable);
          setLinkedAccounts([]);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [isEdit, personId, workplaceCurrency, workplaceId]);

  useEffect(() => {
    if (!isEdit || !personId || isLoading) return;
    let active = true;
    // Refresh linked books when peopleTick fires after link/unlink elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshLinkedAccounts().finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [isEdit, isLoading, peopleTick, personId, refreshLinkedAccounts]);

  const handleLinkExistingAccount = useCallback(
    async (accountId: AccountId) => {
      if (!personId || isLinkingAccount) return;
      setIsLinkingAccount(true);
      setAccountPickerOpen(false);
      try {
        await linkExistingAccount(workplaceId, personId, accountId);
        toast.success('Account linked.');
        // peopleTick will refresh linked accounts; keep an immediate refresh for snappy UI.
        await refreshLinkedAccounts();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not link account.');
      } finally {
        setIsLinkingAccount(false);
      }
    },
    [isLinkingAccount, personId, refreshLinkedAccounts, workplaceId],
  );

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

  const savePerson = useCallback(async () => {
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
  }, [
    color,
    defaultCurrencyCode,
    duplicatePerson,
    email,
    icon,
    initialAccountId,
    isEdit,
    isPinned,
    isSaving,
    name,
    notes,
    paymentHandle,
    personId,
    phone,
    workplaceId,
  ]);

  const openPersonAppearancePicker = useCallback(() => {
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
    });
  }, [color, icon, theme.primary]);

  const onAccountPickerSelect = useCallback(
    (id: AccountId) => {
      if (isEdit) {
        void handleLinkExistingAccount(id);
        return;
      }
      setInitialAccountId(id);
      setAccountPickerOpen(false);
    },
    [handleLinkExistingAccount, isEdit],
  );

  const trimmedName = name.trim();
  const isSaveDisabled = !trimmedName || Boolean(duplicatePerson) || isSaving;
  const requirementHint = !trimmedName
    ? 'Enter a person name to continue.'
    : duplicatePerson
      ? `Already exists as "${duplicatePerson.personName}".`
      : undefined;
  const hasSecondaryValues = Boolean(phone.trim() || email.trim() || notes.trim());

  return {
    isEdit,
    isLoading,
    workplaceCurrency,
    currencies,
    theme,
    chrome,
    name,
    setName,
    icon,
    color,
    defaultCurrencyCode,
    setDefaultCurrencyCode,
    paymentHandle,
    setPaymentHandle,
    phone,
    setPhone,
    email,
    setEmail,
    notes,
    setNotes,
    isPinned,
    setIsPinned,
    initialAccountId,
    setInitialAccountId,
    showMoreDetails,
    setShowMoreDetails,
    linkableAccounts,
    linkedAccounts,
    currencyPickerOpen,
    setCurrencyPickerOpen,
    accountPickerOpen,
    setAccountPickerOpen,
    isLinkingAccount,
    isSaving,
    duplicatePerson,
    selectedAccount,
    trimmedName,
    isSaveDisabled,
    requirementHint,
    hasSecondaryValues,
    savePerson,
    openAppearancePicker: openPersonAppearancePicker,
    onAccountPickerSelect,
  };
}
