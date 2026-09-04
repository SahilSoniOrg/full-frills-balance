import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ImportPluginCard } from '@/src/components/settings/ImportPluginCard';
import { Box } from '@/src/design-system';
import { importRegistry } from '@/src/services/import';
import { toast } from '@/src/utils/alerts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { pickAndPrepareRestore, rememberPreparedRestore } from './pickRestoreSource';
import type { V2Backup } from './pickRestoreSource';
import { V2RestoreSelectionSheet } from './V2RestoreSelectionSheet';
import type { RestoreSourceOutput } from './setupTypes';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { generator } from '@/src/data/database/idGenerator';
import { prepareFirstRunRestoreFixture } from '@/src/testing/fixtures/firstRunRestoreBackup';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { PreparedRestore } from '@/src/services/import/restoreTypes';

type WorkplaceEntry = NonNullable<V2Backup['workplaces']>[number];

export function RestoreSourceSlice({
  isCompleting,
  onContinue,
}: {
  readonly isCompleting: boolean;
  readonly onContinue: (output: RestoreSourceOutput) => void;
}) {
  const plugins = useMemo(() => importRegistry.getAll(), []);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const [selection, setSelection] = useState<{
    workplaces: WorkplaceEntry[];
    selectedIndexes: number[];
  }>();
  const selectionResolver = useRef<((indexes: number[]) => void) | undefined>(undefined);
  const preparing = progressMessage !== undefined || isCompleting;
  const isSettingsE2e = readE2eLaunchConfig()?.seedProfile === 'settings-bulk-restore';

  const selectV2Workplaces = useCallback((workplaces: WorkplaceEntry[]) => {
    return new Promise<number[]>(resolve => {
      selectionResolver.current = resolve;
      setSelection({
        workplaces,
        selectedIndexes: workplaces.map((_, index) => index),
      });
    });
  }, []);

  useEffect(() => {
    const seedProfile = readE2eLaunchConfig()?.seedProfile;
    if (seedProfile !== 'bulk-restore-selection' && seedProfile !== 'settings-bulk-restore') return;
    const workplaces =
      seedProfile === 'bulk-restore-selection'
        ? [
            {
              workplace: { name: 'Personal', icon: 'briefcase', defaultCurrencyCode: 'USD' },
              data: {},
            },
            {
              workplace: { name: 'Freelance', icon: 'briefcase', defaultCurrencyCode: 'EUR' },
              data: {},
            },
            {
              workplace: { name: 'Side project', icon: 'briefcase', defaultCurrencyCode: 'GBP' },
              data: {},
            },
          ]
        : [
            {
              workplace: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
              data: {},
            },
            {
              workplace: {
                name: 'Imported Books 2',
                icon: 'briefcase',
                defaultCurrencyCode: 'USD',
              },
              data: {},
            },
          ];
    void selectV2Workplaces(workplaces);
  }, [selectV2Workplaces]);

  const onSelect = useCallback(
    async (pluginId: string) => {
      setProgressMessage('Preparing restore source...');
      try {
        const result = await pickAndPrepareRestore(
          pluginId,
          (message, progress) => {
            setProgressMessage(
              progress === undefined ? message : `${message} ${Math.round(progress * 100)}%`,
            );
          },
          selectV2Workplaces,
        );
        if (result === 'cancelled') return;
        onContinue(result);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      } finally {
        setProgressMessage(undefined);
      }
    },
    [onContinue, selectV2Workplaces],
  );

  const completeSettingsE2eRestore = useCallback(
    async (selectedIndexes: number[]) => {
      setProgressMessage('Preparing restore source...');
      try {
        const preparedBase = await prepareFirstRunRestoreFixture();
        const sources: RestoreSourceOutput[] = selectedIndexes.map((index, position) => {
          const prepared = cloneSettingsFixture(preparedBase, position);
          const operationId = position === 0 ? undefined : (generator() as WorkplaceId);
          rememberPreparedRestore(prepared);
          if (operationId) rememberPreparedRestore(prepared, operationId);
          return {
            source: {
              uri: 'file:///e2e-settings-restore.json',
              name: 'e2e-settings-restore.json',
              fingerprint: prepared.fingerprint,
            },
            facts: {
              ...prepared.facts,
              workplace: {
                ...prepared.facts.workplace,
                name: index === 0 ? 'Imported Books' : 'Imported Books 2',
              },
            },
            ...(operationId ? { operationId } : {}),
          };
        });
        const [primary, ...batch] = sources;
        if (!primary) throw new Error('Select at least one workplace to restore');
        onContinue({ ...primary, ...(batch.length > 0 ? { batch } : {}) });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not prepare the selected backup.',
        );
      } finally {
        setProgressMessage(undefined);
      }
    },
    [onContinue],
  );

  useEffect(() => {
    if (!isSettingsE2e || !selection) return;
    const timer = setTimeout(() => {
      setSelection(undefined);
      void completeSettingsE2eRestore(selection.selectedIndexes);
    }, 1800);
    return () => clearTimeout(timer);
  }, [completeSettingsE2eRestore, isSettingsE2e, selection]);

  return (
    <Box flex={1} testID="restore-source-slice">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Box padding="lg">
          <AppText variant="title">{AppConfig.strings.settings.importTitle}</AppText>
          <AppText variant="body" style={styles.intro}>
            {AppConfig.strings.settings.importIntro}
          </AppText>

          {plugins.map((plugin, index) => (
            <ImportPluginCard
              key={plugin.id}
              plugin={plugin}
              index={index}
              isBusy={preparing}
              onSelect={onSelect}
              testIDPrefix="restore-plugin"
            />
          ))}

          <View style={styles.note}>
            <AppText variant="caption" color="secondary" style={styles.noteText}>
              {AppConfig.strings.settings.importNote}
            </AppText>
          </View>
        </Box>
      </ScrollView>
      {selection && (
        <V2RestoreSelectionSheet
          visible
          workplaces={selection.workplaces}
          selectedIndexes={selection.selectedIndexes}
          onChange={selectedIndexes =>
            setSelection(current => current && { ...current, selectedIndexes })
          }
          onClose={() => {
            selectionResolver.current?.([]);
            selectionResolver.current = undefined;
            setSelection(undefined);
          }}
          onConfirm={() => {
            if (isSettingsE2e) {
              selectionResolver.current = undefined;
              setSelection(undefined);
              void completeSettingsE2eRestore(selection.selectedIndexes);
              return;
            }
            selectionResolver.current?.(selection.selectedIndexes);
            selectionResolver.current = undefined;
            setSelection(undefined);
          }}
        />
      )}
    </Box>
  );
}

function cloneSettingsFixture(prepared: PreparedRestore, index: number): PreparedRestore {
  const prefix = `settings-${index}-${generator()}`;
  const accountIds = new Map<string, AccountId>(
    prepared.canonicalData.accounts.map(account => [
      account.id,
      `${prefix}-${account.id}` as AccountId,
    ]),
  );
  const journalIds = new Map<string, JournalId>(
    prepared.canonicalData.journals.map(journal => [
      journal.id,
      `${prefix}-${journal.id}` as JournalId,
    ]),
  );
  return {
    ...prepared,
    fingerprint: `${prepared.fingerprint}:${prefix}`,
    canonicalData: {
      ...prepared.canonicalData,
      accounts: prepared.canonicalData.accounts.map(account => ({
        ...account,
        id: accountIds.get(account.id) ?? account.id,
      })),
      journals: prepared.canonicalData.journals.map(journal => ({
        ...journal,
        id: journalIds.get(journal.id) ?? journal.id,
      })),
      transactions: prepared.canonicalData.transactions.map(transaction => ({
        ...transaction,
        id: `${prefix}-${transaction.id}`,
        accountId: accountIds.get(transaction.accountId) ?? transaction.accountId,
        journalId: journalIds.get(transaction.journalId) ?? transaction.journalId,
      })),
    },
  };
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xl },
  intro: { marginBottom: Spacing.md },
  note: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  noteText: { textAlign: 'center' },
});
