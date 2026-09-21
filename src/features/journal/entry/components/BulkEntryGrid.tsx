import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppButton, AppIcon, AppText, Icon } from '@/src/components/core';
import { AppConfig, MAX_BULK_JOURNAL_ROWS, Spacing, Shape, Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { BulkJournalRow, BulkJournalRowActions } from '../types/bulkJournal';
import { BulkEntryRow } from './BulkEntryRow';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountRole } from '@/src/types/domainJournal';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import { DateTimePickerModal } from '@/src/components/filters/DateTimePickerModal';
import { getBulkJournalRowError } from '../hooks/bulkJournalHelpers';
import dayjs from 'dayjs';
import type { WorkplaceId } from '@/src/types/ids';

interface BulkEntryGridProps {
  rows: BulkJournalRow[];
  submitError: string | null;
  accounts: AccountFields[];
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  addRow: () => void;
  removeRow: (id: string) => void;
  clearRows: () => void;
  rowActions: BulkJournalRowActions;
  swapRowAccounts: (rowId: string) => void;
  refreshRowRate: (rowId: string) => void;
  onCreateAccountRequest?: (rowId: string, role: AccountRole, intent: CreateAccountIntent) => void;
  isAtMaxRows: boolean;
}

export const BulkEntryGrid = React.memo(
  ({
    rows,
    submitError,
    accounts,
    workplaceCurrency,
    workplaceId,
    addRow,
    removeRow,
    clearRows,
    rowActions,
    swapRowAccounts,
    refreshRowRate,
    onCreateAccountRequest,
    isAtMaxRows,
  }: BulkEntryGridProps) => {
    const { theme } = useTheme();

    const [expandedAccountPicker, setExpandedAccountPicker] = useState<{
      rowId: string;
      side: 'left' | 'right';
    } | null>(null);
    const [datePickerRowId, setDatePickerRowId] = useState<string | null>(null);

    const datePickerRow = useMemo(
      () => rows.find(row => row.id === datePickerRowId) ?? null,
      [datePickerRowId, rows],
    );
    useEffect(() => {
      setExpandedAccountPicker(null);
      setDatePickerRowId(null);
    }, [rows.length]);
    // Positional labels are derived metadata. Invalidate FlashList's item
    // renderer when order changes without making keystrokes remount rows.
    const rowOrderKey = useMemo(() => rows.map(row => row.id).join('|'), [rows]);
    const errorCount = useMemo(
      () => rows.filter(row => getBulkJournalRowError(row)).length,
      [rows],
    );
    const allEmpty = useMemo(
      () =>
        rows.every(
          row =>
            !row.description.trim() &&
            !row.notes.trim() &&
            !row.amount &&
            !row.sourceId &&
            !row.destinationId,
        ),
      [rows],
    );

    const handleToggleAccountExpansion = useCallback((rowId: string, side: 'left' | 'right') => {
      Keyboard.dismiss();
      setExpandedAccountPicker(current =>
        current?.rowId === rowId && current.side === side ? null : { rowId, side },
      );
    }, []);

    const handleAddRow = useCallback(() => {
      Keyboard.dismiss();
      const focused = TextInput.State.currentlyFocusedInput();
      if (focused) TextInput.State.blurTextInput(focused);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }
      setExpandedAccountPicker(null);
      setDatePickerRowId(null);
      addRow();
    }, [addRow]);

    const handleRemoveRow = useCallback(
      (rowId: string) => {
        setExpandedAccountPicker(current => (current?.rowId === rowId ? null : current));
        setDatePickerRowId(current => (current === rowId ? null : current));
        removeRow(rowId);
      },
      [removeRow],
    );

    const handleClearRows = useCallback(() => {
      setExpandedAccountPicker(null);
      setDatePickerRowId(null);
      clearRows();
    }, [clearRows]);

    const renderRow = useCallback(
      ({ item: row, index }: { item: BulkJournalRow; index: number }) => (
        <BulkEntryRow
          key={row.id}
          row={row}
          index={index}
          accounts={accounts}
          workplaceCurrency={workplaceCurrency}
          workplaceId={workplaceId}
          rowActions={rowActions}
          onRemove={handleRemoveRow}
          onDateTimePickerRequest={setDatePickerRowId}
          accountExpansion={
            expandedAccountPicker?.rowId === row.id ? expandedAccountPicker.side : null
          }
          onToggleAccountExpansion={handleToggleAccountExpansion}
          onSwapAccounts={swapRowAccounts}
          onRefreshRate={refreshRowRate}
          onCreateAccountRequest={onCreateAccountRequest}
        />
      ),
      [
        accounts,
        expandedAccountPicker,
        handleRemoveRow,
        handleToggleAccountExpansion,
        swapRowAccounts,
        refreshRowRate,
        onCreateAccountRequest,
        rowActions,
        workplaceCurrency,
        workplaceId,
      ],
    );

    const listHeader = (
      <>
        {allEmpty && (
          <View
            style={[
              styles.emptyHint,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: theme.border,
              },
            ]}
          >
            <AppIcon name={Icon.Info} size={Size.iconSm} color={theme.textTertiary} />
            <AppText variant="caption" color="tertiary" style={styles.emptyHintText}>
              {AppConfig.strings.transactionFlow.bulkEntryHint}
            </AppText>
          </View>
        )}

        {submitError && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: theme.error + '1A', borderColor: theme.error },
            ]}
          >
            <AppText variant="body" color="error" weight="semibold">
              {submitError}
            </AppText>
          </View>
        )}
      </>
    );

    const listFooter = (
      <AppButton
        variant="outline"
        onPress={handleAddRow}
        disabled={isAtMaxRows}
        style={styles.addButton}
      >
        + Add Entry Row
      </AppButton>
    );

    return (
      <View style={styles.container}>
        {/* Stats strip: row count, validation, clear all */}
        {!allEmpty && (
          <View style={[styles.statsBar, { borderBottomColor: theme.border }]}>
            <View style={styles.statsLeft}>
              <AppText variant="caption" weight="semibold" color="secondary">
                {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              </AppText>
              <View
                style={[
                  styles.statsDot,
                  { backgroundColor: errorCount > 0 ? theme.error : theme.success },
                ]}
              />
              <AppText variant="caption" color={errorCount > 0 ? 'error' : 'secondary'}>
                {errorCount > 0 ? `${errorCount} need attention` : 'All valid'}
              </AppText>
              {isAtMaxRows && (
                <AppText variant="caption" color="tertiary">
                  {AppConfig.strings.transactionFlow.bulkEntryMaxRows(MAX_BULK_JOURNAL_ROWS)}
                </AppText>
              )}
            </View>
            <TouchableOpacity
              onPress={handleClearRows}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppText variant="caption" color="primary" weight="semibold">
                Clear All
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === 'web' ? (
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          >
            {listHeader}
            {rows.map((row, index) => renderRow({ item: row, index }))}
            {listFooter}
          </ScrollView>
        ) : (
          <FlashList
            data={rows}
            renderItem={renderRow}
            keyExtractor={row => row.id}
            extraData={rowOrderKey}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <DateTimePickerModal
          visible={datePickerRow !== null}
          date={dayjs(datePickerRow?.journalDate).format('YYYY-MM-DD')}
          time={dayjs(datePickerRow?.journalDate).format('HH:mm')}
          onClose={() => setDatePickerRowId(null)}
          onSelect={(date, time) => {
            if (!datePickerRow) return;
            rowActions.setJournalDate(datePickerRow.id, dayjs(`${date}T${time}`).valueOf());
          }}
        />
      </View>
    );
  },
);

BulkEntryGrid.displayName = 'BulkEntryGrid';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  statsLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  emptyHintText: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxxl,
  },
  errorBanner: {
    padding: Spacing.md,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  addButton: {
    alignSelf: 'stretch',
    marginBottom: Spacing.xl,
  },
});
