import { storage } from '@/src/utils/storage';
import type { LaunchSetupDraft } from '@/src/services/launch/launchResolver';
import { SETUP_DRAFT_KEY, isSetupJourneyId } from './setupDraftIdentity';

export { SETUP_DRAFT_KEY, SETUP_JOURNEY_IDS, isSetupJourneyId } from './setupDraftIdentity';
export type { SetupJourneyId } from './setupDraftIdentity';

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
      !isSetupJourneyId(value.journeyId) ||
      value.entryPolicy !== 'blocking' ||
      typeof value.operationId !== 'string' ||
      value.operationId.trim() === ''
    ) {
      return undefined;
    }
    return { journeyId: value.journeyId, entryPolicy: 'blocking' };
  } catch {
    return undefined;
  }
}
