import type { AccountFields } from '@/src/types/domain';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountPickerList, CreateAccountIntent } from './AccountPickerList';
import { BaseAccountPickerModal } from './BaseAccountPickerModal';
import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

export type { CreateAccountIntent };

type AccountPickerModalBaseProps = {
  visible: boolean;
  accounts: (AccountFields | PlainAccount)[];
  title?: string;
  onClose: () => void;
  onCreateRequest?: (intent: CreateAccountIntent) => void;
  excludeParentAccounts?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  onClear?: () => void;
};

export type AccountPickerModalProps = AccountPickerModalBaseProps & {
  selectedId?: AccountId;
  onSelect: (accountId: AccountId) => void;
};

export type MultiAccountPickerModalProps = AccountPickerModalBaseProps & {
  accounts: AccountFields[];
  selectedIds: AccountId[];
  onSelect: (accountIds: AccountId[]) => void;
};

export function AccountPickerModal({
  visible,
  accounts,
  selectedId,
  title = 'Select Account',
  onClose,
  onSelect,
  onCreateRequest,
  excludeParentAccounts = false,
  allowNone = false,
  noneLabel = 'None',
  onClear,
}: AccountPickerModalProps) {
  const selectedIds = useMemo(() => new Set(selectedId ? [selectedId] : []), [selectedId]);
  const { theme } = useTheme();

  return (
    <BaseAccountPickerModal visible={visible} onClose={onClose} title={title}>
      {allowNone && onClear ? (
        <TouchableOpacity
          style={[
            styles.noneOption,
            {
              backgroundColor: withOpacity(theme.primary, Opacity.hover),
              borderColor: theme.primary,
            },
          ]}
          onPress={() => {
            onClear();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel={noneLabel}
        >
          <AppIcon name="eject" size={Size.iconMd} color={theme.primary} />
          <AppText variant="body" color="primary" weight="bold" style={styles.noneLabel}>
            {noneLabel}
          </AppText>
          {!selectedId && <AppIcon name="check" size={Size.iconMd} color={theme.primary} />}
        </TouchableOpacity>
      ) : null}
      <AccountPickerList
        accounts={accounts}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onCreateRequest={onCreateRequest}
        onClose={onClose}
        isMultiple={false}
        excludeParentAccounts={excludeParentAccounts}
      />
    </BaseAccountPickerModal>
  );
}

const styles = StyleSheet.create({
  noneOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: Size.touchTarget,
    borderWidth: 1,
    borderRadius: Shape.radius.md,
  },
  noneLabel: { flex: 1 },
});

export function MultiAccountPickerModal({
  visible,
  accounts,
  selectedIds,
  title = 'Select Accounts',
  onClose,
  onSelect,
  onCreateRequest,
  excludeParentAccounts = false,
}: MultiAccountPickerModalProps) {
  const [draftSelected, setDraftSelected] = useState<Set<AccountId>>(() => new Set(selectedIds));
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setDraftSelected(new Set(selectedIds));
    }
    wasVisibleRef.current = visible;
  }, [visible, selectedIds]);

  const handleToggle = useCallback((id: AccountId) => {
    setDraftSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleApply = useCallback(
    (ids: Set<AccountId>) => {
      onSelect(Array.from(ids));
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <BaseAccountPickerModal visible={visible} onClose={onClose} title={title}>
      <AccountPickerList
        accounts={accounts}
        selectedIds={draftSelected}
        onToggle={handleToggle}
        onApply={handleApply}
        onCreateRequest={onCreateRequest}
        onClose={onClose}
        isMultiple
        excludeParentAccounts={excludeParentAccounts}
      />
    </BaseAccountPickerModal>
  );
}
