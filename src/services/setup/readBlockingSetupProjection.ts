import type { LaunchSetupDraft } from '@/src/services/launch/launchResolver';
import { parseSetupDraft } from './SetupDraftStore';

/** Launch and Setup share parseSetupDraft. Unreadable storage fails closed. */
export function readBlockingSetupProjection(raw: string | undefined): LaunchSetupDraft | undefined {
  if (!raw) return undefined;
  try {
    const draft = parseSetupDraft(JSON.parse(raw));
    if (!draft) return { unreadable: true };
    if (draft.entryPolicy !== 'blocking') return undefined;
    return { journeyId: draft.journeyId, entryPolicy: 'blocking' };
  } catch {
    return { unreadable: true };
  }
}
