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

const subscribers = new Set<() => void>();

export function subscribeToSetupDraft(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

/** SetupDraftStore is the sole writer and publishes changes to launch synchronously. */
export function notifySetupDraftChanged(): void {
  for (const subscriber of subscribers) subscriber();
}

export function readSetupDraftSnapshot(): string | undefined {
  return storage.getString(SETUP_DRAFT_KEY);
}

/** Launch reads only the blocking gate projection; Setup owns the full draft parser. */
export function readBlockingSetupProjection(
  raw: string | undefined = readSetupDraftSnapshot(),
): LaunchSetupDraft | undefined {
  try {
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
