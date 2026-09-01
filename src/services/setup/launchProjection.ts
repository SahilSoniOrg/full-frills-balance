import { storage } from '@/src/utils/storage';
import { SETUP_DRAFT_KEY } from './setupDraftIdentity';

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
