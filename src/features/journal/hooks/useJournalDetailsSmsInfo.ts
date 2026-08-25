import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataModule';
import { useObservable } from '@/src/hooks/useObservable';
import {
  mapSmsJournalMetadataDisplay,
  SmsJournalInfoDisplay,
} from '@/src/services/journal/journalDetailsHelpers';
import { smsService } from '@/src/services/sms-service';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export function useJournalDetailsSmsInfo(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): SmsJournalInfoDisplay[] | undefined {
  const { data } = useObservable<SmsJournalInfoDisplay[] | undefined>(
    () => {
      if (!journalId) return of(undefined);

      return from(journalMetadataRepository.findByJournalId(journalId, workplaceId)).pipe(
        switchMap(metadata =>
          from(smsService.findAllByLinkedJournalId(workplaceId, journalId)).pipe(
            map(inboxRecords => {
              if (!metadata && inboxRecords.length === 0) return undefined;
              const records = inboxRecords.length > 0 ? inboxRecords : [null];
              return records.map((inboxRecord, index) =>
                mapSmsJournalMetadataDisplay({
                  originalSmsSender: index === 0 ? metadata?.originalSmsSender : undefined,
                  originalSmsBody: index === 0 ? metadata?.originalSmsBody : undefined,
                  metadataJson: index === 0 ? metadata?.metadataJson : undefined,
                  inboxRecord,
                }),
              );
            }),
          ),
        ),
      );
    },
    [journalId, workplaceId],
    undefined,
  );

  return data;
}
