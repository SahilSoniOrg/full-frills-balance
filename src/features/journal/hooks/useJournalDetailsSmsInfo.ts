import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataModule';
import { useObservable } from '@/src/hooks/useObservable';
import {
  mapSmsJournalMetadataDisplay,
  SmsJournalInfoDisplay,
} from '@/src/services/journal/journalDetailsHelpers';
import { smsService } from '@/src/services/sms-service';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export function useJournalDetailsSmsInfo(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): SmsJournalInfoDisplay | undefined {
  const { data } = useObservable<SmsJournalInfoDisplay | undefined>(
    () => {
      if (!journalId) return of(undefined);

      return from(journalMetadataRepository.findByJournalId(journalId, workplaceId)).pipe(
        switchMap(metadata => {
          if (!metadata) return of(undefined);

          return from(smsService.findByLinkedJournalId(journalId)).pipe(
            map(inboxRecord =>
              mapSmsJournalMetadataDisplay({
                originalSmsSender: metadata.originalSmsSender,
                originalSmsBody: metadata.originalSmsBody,
                metadataJson: metadata.metadataJson,
                inboxRecord: inboxRecord ?? null,
              }),
            ),
          );
        }),
      );
    },
    [journalId, workplaceId],
    undefined,
  );

  return data;
}
