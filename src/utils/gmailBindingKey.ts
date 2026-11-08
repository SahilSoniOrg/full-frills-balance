import type { WorkplaceId } from '@/src/types/ids';

export const GMAIL_BINDING_KEY_PREFIX = 'gmail_capture_device:';
export const gmailBindingKey = (workplaceId: WorkplaceId): string =>
  `${GMAIL_BINDING_KEY_PREFIX}${workplaceId}`;
