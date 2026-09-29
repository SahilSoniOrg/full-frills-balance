export interface InboxAuditStateInput {
  channel?: string | null;
  inputDate?: number | null;
  parseStatus?: string | null;
  parsedAmount?: number | null;
  parsedCurrencyCode?: string | null;
  parsedMerchant?: string | null;
  parsedAccountSource?: string | null;
  direction?: string | null;
  processingStatus?: string | null;
  linkedJournalId?: string | null;
  duplicateJournalId?: string | null;
  duplicateConfidence?: number | null;
  parseConfidence?: number | null;
  parseReason?: string | null;
}

/** User-visible inbox state, deliberately excluding raw messages and sender identifiers. */
export function inboxAuditState(record: InboxAuditStateInput): Record<string, unknown> {
  return {
    channel: record.channel ?? null,
    inputDate: record.inputDate ?? null,
    parseStatus: record.parseStatus ?? null,
    parsedAmount: record.parsedAmount ?? null,
    parsedCurrencyCode: record.parsedCurrencyCode ?? null,
    parsedMerchant: record.parsedMerchant ?? null,
    parsedAccountSource: record.parsedAccountSource ?? null,
    direction: record.direction ?? null,
    processingStatus: record.processingStatus ?? null,
    linkedJournalId: record.linkedJournalId ?? null,
    duplicateJournalId: record.duplicateJournalId ?? null,
    duplicateConfidence: record.duplicateConfidence ?? null,
    parseConfidence: record.parseConfidence ?? null,
    parseReason: record.parseReason ?? null,
  };
}

export function mergeInboxAuditState(
  current: InboxAuditStateInput,
  updates: Partial<InboxAuditStateInput>,
): Record<string, unknown> {
  const value = <K extends keyof InboxAuditStateInput>(key: K) =>
    Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : current[key];

  return inboxAuditState({
    channel: value('channel'),
    inputDate: value('inputDate'),
    parseStatus: value('parseStatus'),
    parsedAmount: value('parsedAmount'),
    parsedCurrencyCode: value('parsedCurrencyCode'),
    parsedMerchant: value('parsedMerchant'),
    parsedAccountSource: value('parsedAccountSource'),
    direction: value('direction'),
    processingStatus: value('processingStatus'),
    linkedJournalId: value('linkedJournalId'),
    duplicateJournalId: value('duplicateJournalId'),
    duplicateConfidence: value('duplicateConfidence'),
    parseConfidence: value('parseConfidence'),
    parseReason: value('parseReason'),
  });
}

export function sameInboxAuditState(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}
