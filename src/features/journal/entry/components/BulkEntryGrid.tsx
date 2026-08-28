import React, { useState, useMemo, useCallback } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
} from 'react-native';
import { AppButton, AppText, AppIcon } from '@/src/components/core';
import {
  AppConfig,
  MAX_BULK_JOURNAL_ROWS,
  Spacing,
  Shape,
  Size,
  Typography,
} from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { BulkJournalRow, BulkRowFieldValue } from '../types/bulkJournal';
import { BulkEntryRow } from './BulkEntryRow';
import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AccountPickerModal } from '@/src/components/account-selection';
import type { AccountFields } from '@/src/types/plainDtos';
import dayjs from 'dayjs';

interface BulkEntryGridProps {
  rows: BulkJournalRow[];
  submitError: string | null;
  accounts: AccountFields[];
  addRow: () => void;
  removeRow: (id: string) => void;
  clearRows: () => void;
  updateRowField: (rowId: string, field: keyof BulkJournalRow, value: BulkRowFieldValue) => void;
  isAtMaxRows: boolean;
}

export const BulkEntryGrid = React.memo(
  ({
    rows,
    submitError,
    accounts,
    addRow,
    removeRow,
    clearRows,
    updateRowField,
    isAtMaxRows,
  }: BulkEntryGridProps) => {
    const { theme } = useTheme();

    const [activePicker, setActivePicker] = useState<{
      type: 'date' | 'source' | 'destination';
      rowId: string;
    } | null>(null);

    const activeRow = useMemo(() => {
      if (!activePicker) return null;
      return rows.find(r => r.id === activePicker.rowId) || null;
    }, [rows, activePicker]);

    const errorCount = useMemo(() => rows.filter(r => r.error).length, [rows]);
    const allEmpty = useMemo(
      () => rows.every(r => !r.description.trim() && !r.amount && !r.sourceId),
      [rows],
    );

    const handleDatePickerRequest = useCallback((rowId: string) => {
      setActivePicker({ type: 'date', rowId });
    }, []);

    const handleAccountPickerRequest = useCallback(
      (rowId: string, role: 'source' | 'destination') => {
        setActivePicker({ type: role, rowId });
      },
      [],
    );

    const handleCloseModals = useCallback(() => {
      setActivePicker(null);
    }, []);

    const handleAddRow = useCallback(() => {
      Keyboard.dismiss();
      const focused = TextInput.State.currentlyFocusedInput();
      if (focused) {
        TextInput.State.blurTextInput(focused);
      }
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
      }
      addRow();
    }, [addRow]);

    const handleDateSelect = useCallback(
      (dateStr: string, timeStr: string) => {
        if (!activePicker || activePicker.type !== 'date') return;
        const nextTimestamp = dayjs(`${dateStr}T${timeStr}`).valueOf();
        updateRowField(activePicker.rowId, 'journalDate', nextTimestamp);
        setActivePicker(null);
      },
      [activePicker, updateRowField],
    );

    const handleAccountSelect = useCallback(
      (accountId: string) => {
        if (!activePicker) return;
        const field = activePicker.type === 'source' ? 'sourceId' : 'destinationId';
        updateRowField(activePicker.rowId, field, accountId);
        setActivePicker(null);
      },
      [activePicker, updateRowField],
    );

    const datePickerValues = useMemo(() => {
      if (!activeRow) return { date: dayjs().format('YYYY-MM-DD'), time: dayjs().format('HH:mm') };
      const d = dayjs(activeRow.journalDate);
      return {
        date: d.format('YYYY-MM-DD'),
        time: d.format('HH:mm'),
      };
    }, [activeRow]);

    const selectedAccountId = useMemo(() => {
      if (!activeRow || !activePicker) return undefined;
      return activePicker.type === 'source' ? activeRow.sourceId : activeRow.destinationId;
    }, [activeRow, activePicker]);

    const renderRow = useCallback(
      ({ item: row, index }: { item: BulkJournalRow; index: number }) => (
        <BulkEntryRow
          row={row}
          index={index}
          accounts={accounts}
          onUpdateField={updateRowField}
          onRemove={removeRow}
          onDatePickerRequest={handleDatePickerRequest}
          onAccountPickerRequest={handleAccountPickerRequest}
        />
      ),
      [accounts, handleAccountPickerRequest, handleDatePickerRequest, removeRow, updateRowField],
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
            <AppIcon name="info" size={Size.iconSm} color={theme.textTertiary} />
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

    const webRows = rows.map((row, index) => renderRow({ item: row, index }));

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
              onPress={clearRows}
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
            {webRows}
            {listFooter}
          </ScrollView>
        ) : (
          <FlashList
            data={rows}
            renderItem={renderRow}
            keyExtractor={row => row.id}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Date & Time Picker Modal */}
        <DateTimePickerModal
          visible={activePicker?.type === 'date'}
          date={datePickerValues.date}
          time={datePickerValues.time}
          onClose={handleCloseModals}
          onSelect={handleDateSelect}
        />

        {/* AccountFields Picker Modal */}
        <AccountPickerModal
          visible={activePicker?.type === 'source' || activePicker?.type === 'destination'}
          accounts={accounts}
          selectedId={selectedAccountId}
          title={
            activePicker?.type === 'source' ? 'Select Source Account' : 'Select Destination Account'
          }
          onClose={handleCloseModals}
          onSelect={handleAccountSelect}
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
  clearText: {
    fontSize: Typography.sizes.sm,
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
