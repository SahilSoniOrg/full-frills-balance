import { useObservable } from '@/src/hooks/useObservable';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/ids';
import { Platform } from 'react-native';
import { of } from 'rxjs';

/** Unprocessed SMS count (Android only; 0 elsewhere). */
export function useUnreadSmsCount(workplaceId: WorkplaceId) {
  return useObservable(
    () => (Platform.OS === 'android' ? smsService.observeUnprocessedCount(workplaceId) : of(0)),
    [workplaceId],
    0,
  );
}
