import { setStringAsync } from 'expo-clipboard';
import { DetailGroup } from '@/src/components/shared/DetailGroup';
import { DetailRow } from '@/src/components/shared/DetailRow';
import { AppConfig, JOURNAL_DETAILS_LIMITS } from '@/src/constants';
import { toast } from '@/src/utils/alerts';

export function JournalRecord({ journalId }: { journalId: string }) {
  const { journalNumberLength, journalNumberGroupLength } = JOURNAL_DETAILS_LIMITS;
  const short = journalId.slice(0, journalNumberLength).toUpperCase();
  const label =
    short.length > journalNumberGroupLength
      ? `${short.slice(0, journalNumberGroupLength)}·${short.slice(journalNumberGroupLength)}`
      : short;
  const strings = AppConfig.strings.journalDetails;
  return (
    <DetailGroup title={strings.record}>
      <DetailRow
        label={strings.journalNumber}
        value={label}
        selectable
        testID="journal-record-copy"
        accessibilityLabel={`${strings.journalNumber} ${label}`}
        onLongPress={async () => {
          try {
            await setStringAsync(journalId);
            toast.success(strings.copied);
          } catch {
            toast.error(strings.copyFailed);
          }
        }}
      />
    </DetailGroup>
  );
}
