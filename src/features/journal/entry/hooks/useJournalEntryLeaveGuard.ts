import type { JournalEntryLine } from '@/src/types/domainJournal';
import type { BulkJournalRow } from '@/src/features/journal/entry/types/bulkJournal';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export type JournalDraftFingerprintInput = {
  description: string;
  notes: string;
  journalDate: string;
  journalTime: string;
  transactionType: string;
  lines: JournalEntryLine[];
  batchRows: BulkJournalRow[];
};

/** Stable user-authored state only; generated row ids and derived batch FX fields are excluded. */
export function createJournalDraftFingerprint(input: JournalDraftFingerprintInput): string {
  return JSON.stringify({
    description: input.description,
    notes: input.notes,
    journalDate: input.journalDate,
    journalTime: input.journalTime,
    transactionType: input.transactionType,
    lines: input.lines.map(line => ({
      accountId: line.accountId,
      amount: line.amount,
      transactionType: line.transactionType,
      notes: line.notes,
      exchangeRate: line.exchangeRate,
    })),
    batchRows: input.batchRows.map(row => ({
      description: row.description,
      notes: row.notes,
      amount: row.amount,
      sourceId: row.sourceId,
      destinationId: row.destinationId,
      journalDate: row.journalDate,
    })),
  });
}

export function useJournalEntryLeaveGuard(input: { fingerprint: string; baselineReady: boolean }) {
  const { fingerprint, baselineReady } = input;
  const navigation = useNavigation();
  const latestFingerprintRef = useRef(fingerprint);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    latestFingerprintRef.current = fingerprint;
  }, [fingerprint]);

  // Capture after mount effects have applied account defaults and edit hydration has completed.
  useEffect(() => {
    if (!baselineReady || baseline !== null) return;
    const timer = setTimeout(() => setBaseline(latestFingerprintRef.current), 0);
    return () => clearTimeout(timer);
  }, [baseline, baselineReady]);

  const isDirty = baseline !== null && fingerprint !== baseline;

  const leaveWithoutPrompt = useCallback((action: () => void) => {
    pendingLeaveActionRef.current = action;
    setIsLeaving(true);
  }, []);

  useEffect(() => {
    if (!isLeaving) return;
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    action?.();
  }, [isLeaving]);

  const requestLeave = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      confirm.show({
        title: 'Discard journal entry?',
        message: 'Your changes have not been saved.',
        confirmText: 'Discard changes',
        cancelText: 'Keep editing',
        destructive: true,
        onConfirm: () => leaveWithoutPrompt(action),
      });
    },
    [isDirty, leaveWithoutPrompt],
  );

  const onClose = useCallback(() => requestLeave(AppNavigation.back), [requestLeave]);
  const leaveAfterSave = useCallback(
    () => leaveWithoutPrompt(AppNavigation.back),
    [leaveWithoutPrompt],
  );

  usePreventRemove(isDirty && !isLeaving, ({ data }) => {
    requestLeave(() => navigation.dispatch(data.action));
  });

  return { isDirty, hasBaseline: baseline !== null, onClose, leaveAfterSave };
}
