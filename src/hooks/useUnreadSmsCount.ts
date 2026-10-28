import { useObservable } from '@/src/hooks/useObservable';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/ids';
import { Platform } from 'react-native';
import { EMPTY, of } from 'rxjs';

/** Unprocessed SMS count (Android only; 0 elsewhere). */
export function useUnreadSmsCount(workplaceId: WorkplaceId, enabled = true) {
  return useObservable(
    () =>
      !enabled
        ? EMPTY
        : Platform.OS === 'android'
          ? smsService.observeUnprocessedCount(workplaceId)
          : of(0),
    [enabled, workplaceId],
    0,
  );
}
