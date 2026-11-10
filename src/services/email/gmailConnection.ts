import { storage } from '@/src/utils/storage';
import type { WorkplaceId } from '@/src/types/ids';
import { safeParseJSON } from '@/src/utils/serialization';
import { connectGmail, disconnectGmail, gmailAccessToken } from './gmailAuthorization';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { GMAIL_BINDING_KEY_PREFIX, gmailBindingKey } from '@/src/utils/gmailBindingKey';

interface GmailBinding {
  accountId: string;
  connectedAt: number;
  historyId?: string;
  backgroundEnabled?: boolean;
  automaticCaptureEnabledAt?: number;
}

export class GmailAccountBindingConflictError extends Error {
  constructor() {
    super('The connected Gmail account does not match the account used by other Workplaces.');
    this.name = 'GmailAccountBindingConflictError';
  }
}

/** Google Sign-In is app-wide even though mailbox consent and history are per Workplace. */
function connectedGmailAccountIds(): Set<string> {
  const accountIds = new Set<string>();
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(GMAIL_BINDING_KEY_PREFIX)) continue;
    const raw = storage.getString(key);
    const value = raw ? safeParseJSON<{ accountId?: unknown } | null>(raw, null) : null;
    if (typeof value?.accountId === 'string' && value.accountId) accountIds.add(value.accountId);
  }
  return accountIds;
}

/** Device-local association; a Workplace backup never contains Google identity or authorization. */
export function gmailBinding(workplaceId: WorkplaceId): GmailBinding | null {
  const raw = storage.getString(gmailBindingKey(workplaceId));
  const value = raw ? safeParseJSON<Partial<GmailBinding> | null>(raw, null) : null;
  return value &&
    typeof value.accountId === 'string' &&
    value.accountId &&
    typeof value.connectedAt === 'number' &&
    Number.isFinite(value.connectedAt) &&
    value.connectedAt > 0
    ? {
        accountId: value.accountId,
        connectedAt: value.connectedAt,
        historyId: typeof value.historyId === 'string' ? value.historyId : undefined,
        backgroundEnabled: value.backgroundEnabled === true,
        automaticCaptureEnabledAt:
          typeof value.automaticCaptureEnabledAt === 'number' &&
          Number.isFinite(value.automaticCaptureEnabledAt) &&
          value.automaticCaptureEnabledAt > 0
            ? value.automaticCaptureEnabledAt
            : undefined,
      }
    : null;
}

/** Consent and its cutoff serialize with the journal decision. */
export async function setGmailAutomaticCapture(
  workplaceId: WorkplaceId,
  enabled: boolean,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const current = gmailBinding(workplaceId);
    if (!current) throw new Error('Connect Gmail first.');
    storage.set(
      gmailBindingKey(workplaceId),
      JSON.stringify({ ...current, automaticCaptureEnabledAt: enabled ? Date.now() : undefined }),
    );
  });
}

/** Background mailbox reads require their own explicit device-local consent. */
export async function setGmailBackgroundEnabled(
  workplaceId: WorkplaceId,
  enabled: boolean,
): Promise<void> {
  await runAccountingWriteSession(async () => {
    const current = gmailBinding(workplaceId);
    if (!current) throw new Error('Connect Gmail first.');
    storage.set(
      gmailBindingKey(workplaceId),
      JSON.stringify({ ...current, backgroundEnabled: enabled }),
    );
  });
}

/** Called after user approval; older mailbox messages remain outside automatic ingestion. */
export async function connectGmailForWorkplace(
  workplaceId: WorkplaceId,
  reauthorize = false,
): Promise<boolean> {
  const existing = gmailBinding(workplaceId);
  if (reauthorize && !existing) throw new Error('Gmail is no longer connected to this workplace.');
  const existingAccounts = connectedGmailAccountIds();
  if (existingAccounts.size > 1) throw new GmailAccountBindingConflictError();
  const expectedAccountId = existingAccounts.values().next().value as string | undefined;
  if (reauthorize && existing?.accountId !== expectedAccountId)
    throw new GmailAccountBindingConflictError();
  let result: { accountId: string } | null;
  let credentials: Awaited<ReturnType<typeof gmailAccessToken>>;
  if (expectedAccountId) {
    // Do not open the account picker while any Workplace is connected: Google
    // Sign-In exposes one app-wide account session, not independent mailbox tokens.
    credentials = await gmailAccessToken();
    if (!credentials || credentials.accountId !== expectedAccountId)
      throw new GmailAccountBindingConflictError();
    result = { accountId: credentials.accountId };
  } else {
    result = await connectGmail();
    if (!result) return false;
    credentials = await gmailAccessToken();
    if (!credentials || credentials.accountId !== result.accountId)
      throw new GmailAccountBindingConflictError();
  }
  // First sync deliberately starts without a cursor: it snapshots the Gmail head,
  // scans messages after this consent cutoff, then commits the cursor. This closes
  // the arrival window between recording consent and obtaining a history cursor.
  const connectedAt = Date.now();
  await runAccountingWriteSession(async () => {
    if ([...connectedGmailAccountIds()].some(accountId => accountId !== result.accountId))
      throw new GmailAccountBindingConflictError();
    if (reauthorize) {
      const current = gmailBinding(workplaceId);
      if (
        !current ||
        current.accountId !== existing?.accountId ||
        current.connectedAt !== existing.connectedAt
      )
        throw new Error('Gmail connection changed while signing in.');
      return;
    }
    storage.set(
      gmailBindingKey(workplaceId),
      JSON.stringify({ accountId: result.accountId, connectedAt }),
    );
  });
  return true;
}

/** Disconnect this Workplace and revoke Google access when no Workplace still uses it. */
export async function disconnectGmailForWorkplace(
  workplaceId: WorkplaceId,
): Promise<'not_needed' | 'revoked' | 'failed'> {
  let shouldRevoke = false;
  await runAccountingWriteSession(async () => {
    storage.remove(gmailBindingKey(workplaceId));
    shouldRevoke = connectedGmailAccountIds().size === 0;
  });
  if (!shouldRevoke) return 'not_needed';
  return (await disconnectGmail()) ? 'revoked' : 'failed';
}

export function advanceGmailHistory(
  workplaceId: WorkplaceId,
  expected: GmailBinding,
  historyId: string,
): void {
  const current = gmailBinding(workplaceId);
  if (
    !current ||
    current.accountId !== expected.accountId ||
    current.connectedAt !== expected.connectedAt
  )
    return;
  storage.set(gmailBindingKey(workplaceId), JSON.stringify({ ...current, historyId }));
}
