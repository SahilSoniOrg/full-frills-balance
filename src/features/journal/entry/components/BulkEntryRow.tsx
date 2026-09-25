import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, AppIcon, AppText } from '@/src/components/core';
import { Spacing, Shape, Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { BulkJournalRow, BulkJournalRowActions } from '../types/bulkJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountRole } from '@/src/types/domainJournal';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import { EntryInlineError } from './EntryInlineError';
import { EntryTransactionCard } from './EntryTransactionCard';
import type { ExpansionPosition } from './AccountPickerPanel';
import { getBulkJournalRowError } from '../hooks/bulkJournalHelpers';
import { resolveBulkRowFxPair } from '../hooks/useBulkJournalEditor';
import { buildSimpleFormAccountSections } from '@/src/services/journal/simpleJournalHelpers';
import { filterToLeafAccounts } from '@/src/services/journal/guidedJournalAccountEligibility';
import { resolveSimpleTypeAccentColor } from '../journalEntryPresentation';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import type { WorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';

const BATCH_SUGGESTION_MAX_HEIGHT = Size.xxl * 2 + Size.lg;

interface BulkEntryRowProps {
  row: BulkJournalRow;
  index: number;
  accounts: AccountFields[];
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  rowActions: BulkJournalRowActions;
  onRemove: (id: string) => void;
  onDateTimePickerRequest: (id: string) => void;
  accountExpansion: ExpansionPosition;
  onToggleAccountExpansion: (id: string, side: 'left' | 'right') => void;
  onSwapAccounts: (id: string) => void;
  onRefreshRate: (id: string) => void;
  onCreateAccountRequest?: (rowId: string, role: AccountRole, intent: CreateAccountIntent) => void;
}

export const BulkEntryRow = React.memo(
  ({
    row,
    index,
    accounts,
    workplaceCurrency,
    workplaceId,
    rowActions,
    onRemove,
    onDateTimePickerRequest,
    accountExpansion,
    onToggleAccountExpansion,
    onSwapAccounts,
    onRefreshRate,
    onCreateAccountRequest,
  }: BulkEntryRowProps) => {
    const { theme } = useTheme();
    const { suggestions, suggestionState, loadSuggestions } = useJournalSuggestions(
      workplaceId,
      row.description,
      row.transactionType,
    );
    const leafAccounts = useMemo(() => filterToLeafAccounts(accounts), [accounts]);
    const accountSections = useMemo(
      () =>
        buildSimpleFormAccountSections(row.transactionType, {
          leafAccounts,
          accountPool: accounts,
          sourceId: row.sourceId,
          destinationId: row.destinationId,
        }),
      [accounts, leafAccounts, row.destinationId, row.sourceId, row.transactionType],
    );
    const fxPair = useMemo(
      () => resolveBulkRowFxPair(row, accounts, workplaceCurrency),
      [accounts, row, workplaceCurrency],
    );

    const rowDate = useMemo(() => dayjs(row.journalDate).format('YYYY-MM-DD'), [row.journalDate]);
    const rowTime = useMemo(() => dayjs(row.journalDate).format('HH:mm'), [row.journalDate]);
    const rowError = getBulkJournalRowError(row);
    const updateRowDateTime = (date: string, time: string) => {
      rowActions.setJournalDate(row.id, dayjs(`${date}T${time}`).valueOf());
    };
    return (
      <View style={[styles.container, { borderColor: rowError ? theme.error : theme.border }]}>
        <EntryTransactionCard
          density="compact"
          type={row.transactionType}
          onChangeType={type => rowActions.setTransactionType(row.id, type)}
          accentColor={resolveSimpleTypeAccentColor(row.transactionType, theme)}
          amount={row.amount}
          onChangeAmount={value => rowActions.setAmount(row.id, value)}
          amountTestID={`bulk-amount-${row.id}`}
          pair={fxPair}
          onManualBaseRateChange={(role, value) =>
            rowActions.setManualBaseRate(row.id, role, value)
          }
          onConvertedAmountChange={value => {
            const nextAmount = Number.parseFloat(value);
            if (Number.isFinite(nextAmount) && nextAmount > 0) {
              rowActions.setConvertedAmount(row.id, nextAmount);
            }
          }}
          onResetToApiRate={() => onRefreshRate(row.id)}
          fxTestIDPrefix={`bulk-${row.id}`}
          accountSections={accountSections}
          accounts={accounts}
          sourceId={row.sourceId}
          destinationId={row.destinationId}
          expansionPosition={accountExpansion}
          onToggleExpansion={side => onToggleAccountExpansion(row.id, side)}
          onSelectSource={id => {
            rowActions.setSourceAccount(row.id, id);
            onToggleAccountExpansion(row.id, 'left');
          }}
          onSelectDestination={id => {
            rowActions.setDestinationAccount(row.id, id);
            onToggleAccountExpansion(row.id, 'right');
          }}
          onSwapAccounts={() => onSwapAccounts(row.id)}
          onCreateAccountRequest={
            onCreateAccountRequest
              ? (role, intent) => onCreateAccountRequest(row.id, role, intent)
              : undefined
          }
          lazyDropdown
          accountTestIDPrefix={`bulk-route-${row.id}`}
          meta={{
            description: row.description,
            setDescription: value => {
              void loadSuggestions();
              rowActions.setDescription(row.id, value);
            },
            date: rowDate,
            setDate: date => updateRowDateTime(date, rowTime),
            time: rowTime,
            setTime: time => updateRowDateTime(rowDate, time),
            notes: row.notes,
            setNotes: value => rowActions.setNotes(row.id, value),
            suggestions,
            suggestionState,
            suggestionMaxHeight: BATCH_SUGGESTION_MAX_HEIGHT,
            activeTabType: row.transactionType,
            accounts,
            onDescriptionFocus: () => void loadSuggestions(),
            onSelectSuggestion: suggestion => rowActions.applySuggestion(row.id, suggestion),
            onDateTimePickerRequest: () => onDateTimePickerRequest(row.id),
            leadingContent: (
              <AppText variant="caption" color="secondary" weight="bold">
                #{index + 1}
              </AppText>
            ),
            trailingAction: (
              <TouchableOpacity
                onPress={() => onRemove(row.id)}
                style={styles.deleteButton}
                hitSlop={{
                  top: Spacing.md,
                  bottom: Spacing.md,
                  left: Spacing.md,
                  right: Spacing.md,
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete entry ${index + 1}`}
                testID={`bulk-delete-${row.id}`}
              >
                <AppIcon name={Icon.Delete} size={Size.iconXs} color={theme.textSecondary} />
              </TouchableOpacity>
            ),
            descriptionTestID: `bulk-description-${row.id}`,
            descriptionClearTestID: `bulk-clear-description-${row.id}`,
          }}
          metaContainerStyle={styles.metaCardEmbedded}
          exchangeRateContainerStyle={styles.fxCardEmbedded}
          accountSectionsContainerStyle={styles.accountSelector}
        />

        {/* Validation error — shown below all content */}
        {rowError ? <EntryInlineError message={rowError} /> : null}
      </View>
    );
  },
);

BulkEntryRow.displayName = 'BulkEntryRow';

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: Shape.radius.r3,
    borderWidth: 1,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Shape.radius.full,
  },
  metaCardEmbedded: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
  },
  // The folder picker is embedded inside a row card. Give it a definite
  // width so pill text measures against the row, not an intrinsic child width.
  accountSelector: {
    alignSelf: 'stretch',
    marginHorizontal: 0,
    width: '100%',
  },
  fxCardEmbedded: {
    marginHorizontal: 0,
    marginTop: 0,
    alignSelf: 'stretch',
  },
});
