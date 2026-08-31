import { storage } from '@/src/utils/storage';
import type { LaunchSetupDraft } from '@/src/services/launch/launchResolver';

const SETUP_DRAFT_KEY = 'setup_draft_v1';
const JOURNEYS = new Set([
  'first_run',
  'first_run_restore',
  'empty_device_workplace',
  'empty_device_restore',
  'picker_restore',
  'settings_restore',
  'create_workplace',
]);

/** Launch reads only the blocking gate projection; Setup owns the full draft parser. */
export function readBlockingSetupProjection(): LaunchSetupDraft | undefined {
  try {
    const raw = storage.getString(SETUP_DRAFT_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof value.journeyId !== 'string' ||
      !JOURNEYS.has(value.journeyId) ||
      value.entryPolicy !== 'blocking' ||
      typeof value.operationId !== 'string' ||
      value.operationId.trim() === ''
    ) {
      return undefined;
    }
    return { journeyId: value.journeyId, entryPolicy: 'blocking' } as LaunchSetupDraft;
  } catch {
    return undefined;
  }
}
