import { useCallback, useMemo } from 'react';
import { AppConfig } from '@/src/constants';
import {
  createJournalCsvShareable,
  type JournalCsvExportQuery,
} from '@/src/services/export/journalCsvExporter';
import { ShareFormat } from '@/src/types/sharing';
import { useShareable } from './useShareable';

export interface ShareableCsvControl {
  onExportCsv: () => Promise<void>;
  /** True while the CSV file is being built (not while the share sheet is open). */
  isExportingCsv: boolean;
  isExportDisabled: boolean;
}

export function useJournalCsvExport(
  query: JournalCsvExportQuery,
  { disabled = false }: { disabled?: boolean } = {},
): ShareableCsvControl {
  const source = useMemo(() => createJournalCsvShareable(query), [query]);
  const strings = AppConfig.strings.journal.csvExport;
  const { share, isBusy, isPreparing } = useShareable(source, {
    disabled,
    emptyMessage: strings.empty,
    errorMessage: strings.error,
  });
  const onExportCsv = useCallback(async () => {
    await share(ShareFormat.CSV);
  }, [share]);
  return useMemo(
    () => ({
      onExportCsv,
      isExportingCsv: isPreparing,
      isExportDisabled: isBusy || disabled,
    }),
    [onExportCsv, isPreparing, isBusy, disabled],
  );
}
