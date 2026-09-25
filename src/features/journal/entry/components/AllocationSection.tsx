import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppIcon, AppText, Icon, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import type { RowFx } from '@/src/features/journal/entry/hooks/workplaceRowFx';
import { SplitAllocationRow } from '@/src/features/journal/entry/components/SplitAllocationRow';
import {
  allocationStatusColor,
  type AllocationStatusTone,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import type { AccountRole } from '@/src/types/domainJournal';
import type { IconName } from '@/src/types/domainIcons';
import type { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/** One open account picker at a time across a form's rows. */
export function useExclusivePicker() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isExpanded = useCallback((key: string) => activeKey === key, [activeKey]);
  const toggle = useCallback((key: string) => {
    setActiveKey(current => (current === key ? null : key));
  }, []);
  const close = useCallback(() => setActiveKey(null), []);
  const closeIf = useCallback((key: string) => {
    setActiveKey(current => (current === key ? null : current));
  }, []);
  return { isExpanded, toggle, close, closeIf };
}

export function AllocationActions({
  canEqualize,
  canDistribute,
  onEqualize,
  onDistribute,
  equalTestID,
  distributeTestID,
}: {
  canEqualize: boolean;
  canDistribute: boolean;
  onEqualize: () => void;
  onDistribute: () => void;
  equalTestID?: string;
  distributeTestID?: string;
}) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.transactionFlow.splitEntry;

  return (
    <View style={styles.actions}>
      <PressScaleTouchable
        onPress={onEqualize}
        disabled={!canEqualize}
        style={[styles.actionButton, { opacity: canEqualize ? 1 : 0.45 }]}
        accessibilityRole="button"
        testID={equalTestID}
      >
        <AppText variant="caption" color="secondary" weight="semibold">
          {strings.equalSplit}
        </AppText>
      </PressScaleTouchable>
      <View
        style={[
          styles.actionDivider,
          { backgroundColor: withOpacity(theme.border, Opacity.active) },
        ]}
      />
      <PressScaleTouchable
        onPress={onDistribute}
        disabled={!canDistribute}
        style={[styles.actionButton, { opacity: canDistribute ? 1 : 0.45 }]}
        accessibilityRole="button"
        testID={distributeTestID}
      >
        <AppText variant="caption" color="secondary" weight="semibold">
          {strings.distribute}
        </AppText>
      </PressScaleTouchable>
    </View>
  );
}

export type AllocationListRow = {
  id: string;
  accountId: AccountId;
  amount: string;
  fx: RowFx;
  notes?: string;
  moveLabel?: string;
  moveIcon?: IconName;
};

/** The row list shared by a split allocation side and an advanced From or To side. */
export function AllocationRows({
  rows,
  accounts,
  rowAccounts,
  canRemove,
  emptyPrompt,
  label,
  role = 'destination',
  testIDPrefix = 'split',
  isExpanded,
  onToggle,
  onClose,
  onCloseIf,
  onCreateAccount,
  onRemove,
  onSelectAccount,
  onChangeAmount,
  onConvertedAmountChange,
  onResetRate,
  removeLabel,
  notesPlaceholder,
  onChangeNotes,
  onMove,
}: {
  rows: AllocationListRow[];
  accounts: AccountFields[];
  rowAccounts: AccountFields[];
  canRemove: boolean;
  emptyPrompt: string;
  label: string;
  role?: AccountRole;
  testIDPrefix?: string;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
  onCloseIf: (id: string) => void;
  onCreateAccount: (rowId: string, role: AccountRole, intent: CreateAccountIntent) => void;
  onRemove: (id: string) => void;
  onSelectAccount: (id: string, accountId: AccountId) => void;
  onChangeAmount: (id: string, amount: string) => void;
  onConvertedAmountChange: (id: string, amount: string) => void;
  onResetRate: (id: string) => void;
  removeLabel: string;
  notesPlaceholder?: string;
  onChangeNotes?: (id: string, notes: string) => void;
  onMove?: (id: string) => void;
}) {
  return (
    <>
      {rows.map(row => (
        <SplitAllocationRow
          key={row.id}
          allAccounts={accounts}
          allocationAccounts={rowAccounts}
          canRemove={canRemove}
          emptyPrompt={emptyPrompt}
          fx={row.fx}
          isExpanded={isExpanded(row.id)}
          label={label}
          role={role}
          testIDPrefix={testIDPrefix}
          onCreateAccountRequest={(rowRole, intent) => {
            onCreateAccount(row.id, rowRole, intent);
            onClose();
          }}
          onRemove={() => {
            onCloseIf(row.id);
            onRemove(row.id);
          }}
          onSelectAccount={accountId => {
            onSelectAccount(row.id, accountId);
            onClose();
          }}
          onToggle={() => onToggle(row.id)}
          onChangeAmount={amount => onChangeAmount(row.id, amount)}
          notes={onChangeNotes ? row.notes : undefined}
          notesPlaceholder={notesPlaceholder}
          onChangeNotes={onChangeNotes ? notes => onChangeNotes(row.id, notes) : undefined}
          onConvertedAmountChange={amount => onConvertedAmountChange(row.id, amount)}
          onResetToApiRate={() => onResetRate(row.id)}
          onMove={onMove ? () => onMove(row.id) : undefined}
          moveLabel={row.moveLabel}
          moveIcon={row.moveIcon}
          removeLabel={removeLabel}
          row={row}
        />
      ))}
    </>
  );
}

export function AllocationStatusText({
  label,
  tone,
  weight,
  style,
}: {
  label: string | null;
  tone: AllocationStatusTone;
  weight?: 'semibold';
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  if (!label) return null;
  return (
    <AppText
      variant="caption"
      numberOfLines={1}
      weight={weight}
      ellipsizeMode="tail"
      style={[style, { color: allocationStatusColor(tone, theme) }]}
    >
      {label}
    </AppText>
  );
}

export function AllocationSection({
  title,
  headerTrailing,
  status,
  children,
  footer,
  onAdd,
  addLabel,
  addTestID,
  swipeHint,
  style,
}: {
  title: string;
  headerTrailing?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onAdd: () => void;
  addLabel: string;
  addTestID?: string;
  swipeHint?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.section, style]}>
      <View style={[styles.sectionHeader, status ? null : styles.sectionHeaderGap]}>
        <AppText variant="body" color="primary" weight="bold">
          {title}
        </AppText>
        {headerTrailing}
      </View>
      {status}
      <View style={styles.rows}>{children}</View>
      {footer}
      <PressScaleTouchable
        onPress={onAdd}
        style={styles.addButtonTouchable}
        surfaceStyle={[
          styles.addButton,
          { borderColor: withOpacity(theme.primary, Opacity.medium) },
        ]}
        accessibilityRole="button"
        testID={addTestID}
      >
        <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.primary} />
        <AppText variant="caption" color="primary" weight="semibold">
          {addLabel}
        </AppText>
      </PressScaleTouchable>
      {swipeHint ? (
        <AppText variant="caption" color="tertiary" style={styles.swipeHint}>
          {swipeHint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionHeaderGap: {
    marginBottom: Spacing.sm,
  },
  actions: { flexDirection: 'row', gap: Spacing.xs },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    height: Spacing.md,
    alignSelf: 'center',
  },
  actionButton: {
    minHeight: Size.buttonSm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
  },
  rows: { gap: Spacing.sm },
  addButtonTouchable: {
    alignSelf: 'center',
    width: '42%',
    marginTop: Spacing.md,
  },
  addButton: {
    minHeight: Size.buttonSm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Shape.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  swipeHint: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
