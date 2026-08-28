import type { JournalId } from '@/src/types/ids';

export function createSmsJournalAfterSaveHandler(input: {
  smsId?: string;
  markSmsAsProcessed: (smsId: string) => Promise<void>;
}): ((result: { journalId?: JournalId; success?: boolean }) => Promise<void>) | undefined {
  if (!input.smsId) return undefined;
  return async () => input.markSmsAsProcessed(input.smsId!);
}
