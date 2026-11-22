import { useObservable } from '@/src/hooks/useObservable';
import { shortcutSmsIntakeService } from '@/src/services/sms/ShortcutSmsIntakeService';
import { smsService } from '@/src/services/sms-service';
import { WorkplaceId } from '@/src/types/ids';
import { Platform } from 'react-native';
import { EMPTY, of } from 'rxjs';

/** Pending Transaction inbox count on devices that support SMS capture. */
export function useUnreadSmsCount(workplaceId: WorkplaceId, enabled = true) {
  const canCaptureSms = Platform.OS === 'android' || shortcutSmsIntakeService.canSetUp;
  return useObservable(
    () =>
      !enabled ? EMPTY : canCaptureSms ? smsService.observeUnprocessedCount(workplaceId) : of(0),
    [canCaptureSms, enabled, workplaceId],
    0,
  );
}
