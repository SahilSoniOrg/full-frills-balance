import { toByteArray } from 'base64-js';
import { logger } from '@/src/utils/logger';

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  sizeEstimate?: number;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
}

export interface GmailObservation {
  id: string;
  receivedAt: number;
  sender: string;
  subject: string;
  internetMessageId?: string;
  text: string;
  sizeEstimate?: number;
  authenticated?: boolean;
  primaryPlainText?: boolean;
  topLevelMimeType?: string;
}

const API_ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function parseRawEmail(raw: Uint8Array) {
  const { default: PostalMime } = await import('postal-mime');
  return PostalMime.parse(raw, {
    forceRfc822Attachments: true,
    maxNestingDepth: 20,
    maxHeadersSize: 64 * 1024,
    maxPartCount: 200,
  });
}

export class GmailApiError extends Error {
  constructor(readonly status: number) {
    super(`Gmail request failed (${status}).`);
  }
}

export class UnsupportedGmailContentError extends Error {}

function isBase64UrlPayload(raw: string): boolean {
  if (!raw) return false;
  let end = raw.length;
  while (end > 0 && raw[end - 1] === '=') end -= 1;
  const padding = raw.length - end;
  if (padding > 2 || end === 0 || end % 4 === 1) return false;
  for (let index = 0; index < end; index += 4096) {
    if (!/^[A-Za-z0-9_-]+$/.test(raw.slice(index, Math.min(index + 4096, end)))) return false;
  }
  return true;
}

function decodeBody(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bytes = toByteArray(padded);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new UnsupportedGmailContentError('Email content is not valid UTF-8.');
  }
}

function firstPlainText(
  part?: GmailPart,
  primary = true,
): { text: string; primary: boolean } | undefined {
  if (!part || part.filename || part.body?.attachmentId) return undefined;
  if (
    part.headers?.some(
      header =>
        header.name?.toLowerCase() === 'content-disposition' &&
        /^\s*attachment\b/i.test(header.value ?? ''),
    )
  )
    return undefined;
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { text: decodeBody(part.body.data), primary };
  }
  for (const child of part.parts ?? []) {
    const text = firstPlainText(child, primary && part.mimeType === 'multipart/alternative');
    if (text) return text;
  }
  return undefined;
}

function firstBody(part: GmailPart | undefined, mimeType: string): string | undefined {
  if (!part || part.filename || part.body?.attachmentId) return undefined;
  if (
    part.headers?.some(
      h =>
        h.name?.toLowerCase() === 'content-disposition' && /^\s*attachment\b/i.test(h.value ?? ''),
    )
  )
    return undefined;
  if (part.mimeType === mimeType && part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts ?? []) {
    const body = firstBody(child, mimeType);
    if (body) return body;
  }
  return undefined;
}

/** Strip markup for capture/review text; preview rendering keeps a separate sanitizer. */
function htmlBodyText(html: string): string {
  return html
    .replace(/<(script|style|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function observationTextFromFull(payload: GmailPart | undefined):
  | {
      text: string;
      primary: boolean;
    }
  | undefined {
  try {
    const plain = firstPlainText(payload);
    if (plain) return plain;
  } catch (error) {
    if (!(error instanceof UnsupportedGmailContentError)) throw error;
  }
  try {
    const html = firstBody(payload, 'text/html');
    if (html) {
      const text = htmlBodyText(html);
      if (text.trim()) return { text, primary: false };
    }
  } catch (error) {
    if (!(error instanceof UnsupportedGmailContentError)) throw error;
  }
  return undefined;
}

async function observationTextFromRaw(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<{ text: string; primary: boolean; source: 'text' | 'html' } | undefined> {
  const raw = await readGmailRawMessage(token, id, signal);
  if (!raw) return undefined;
  try {
    const parsed = await parseRawEmail(raw);
    let text = parsed.text;
    let source: 'text' | 'html' = 'text';
    if (!text && parsed.html) {
      text = htmlBodyText(parsed.html);
      source = 'html';
    }
    if (!text?.trim()) return undefined;
    // Postal Mime may combine body parts: use only for review, never automatic posting.
    return { text, primary: false, source };
  } catch (error) {
    logger.debug('[Gmail] MIME fallback unavailable', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorCode:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code).slice(0, 40)
          : undefined,
      blobUnsupported: error instanceof Error && /blob|arraybuffer/i.test(error.message),
      textDecoderAvailable: typeof TextDecoder !== 'undefined',
      textEncoderAvailable: typeof TextEncoder !== 'undefined',
    });
    return undefined;
  }
}

/** Fetch the original for a user-requested preview; never persist its body. */
export async function readGmailPreview(token: string, id: string, signal?: AbortSignal) {
  const message = await getJson<GmailMessage>(
    token,
    `${API_ROOT}/messages/${encodeURIComponent(id)}?format=full`,
    signal,
  );
  if (message.id !== id) throw new UnsupportedGmailContentError('Email is unavailable.');
  const html = firstBody(message.payload, 'text/html');
  if (html) return { kind: 'html' as const, content: html };
  const text = firstBody(message.payload, 'text/plain');
  if (text) return { kind: 'text' as const, content: text };
  const raw = await readGmailRawMessage(token, id, signal);
  if (raw) {
    try {
      const parsed = await parseRawEmail(raw);
      if (parsed.html) return { kind: 'html' as const, content: parsed.html };
      if (parsed.text) return { kind: 'text' as const, content: parsed.text };
    } catch (error) {
      logger.debug('[Gmail] MIME preview fallback', {
        reason: 'raw_decode_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
        errorCode:
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code).slice(0, 40)
            : undefined,
        blobUnsupported: error instanceof Error && /blob|arraybuffer/i.test(error.message),
        textDecoderAvailable: typeof TextDecoder !== 'undefined',
        textEncoderAvailable: typeof TextEncoder !== 'undefined',
      });
    }
  }
  throw new UnsupportedGmailContentError('This email has no supported preview.');
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find(item => item.name?.toLowerCase() === name)?.value ?? '';
}

async function getJson<T>(token: string, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new GmailApiError(response.status);
  return response.json() as Promise<T>;
}

export async function gmailHistoryHead(token: string, signal?: AbortSignal): Promise<string> {
  const profile = await getJson<{ historyId?: string }>(token, `${API_ROOT}/profile`, signal);
  if (!profile.historyId) throw new Error('Gmail did not return a history cursor.');
  return profile.historyId;
}

/** Gmail history is paged; callers advance the saved cursor only after all pages commit. */
export async function listGmailHistory(
  token: string,
  historyId: string,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<{ ids: string[]; nextPageToken?: string; historyId?: string }> {
  const query = new URLSearchParams({
    startHistoryId: historyId,
    labelId: 'INBOX',
    historyTypes: 'messageAdded',
    maxResults: '100',
  });
  if (pageToken) query.set('pageToken', pageToken);
  const result = await getJson<{
    history?: { messagesAdded?: { message?: { id?: string } }[] }[];
    nextPageToken?: string;
    historyId?: string;
  }>(token, `${API_ROOT}/history?${query}`, signal);
  return {
    ids: [
      ...new Set(
        (result.history ?? []).flatMap(entry =>
          (entry.messagesAdded ?? []).flatMap(item => (item.message?.id ? [item.message.id] : [])),
        ),
      ),
    ],
    nextPageToken: result.nextPageToken,
    historyId: result.historyId,
  };
}

/** Reads one page after an explicit cutoff. Tokens and unrelated mailbox bodies are never logged. */
export async function listGmailMessageIds(
  token: string,
  after: number,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<{ ids: string[]; nextPageToken?: string }> {
  if (!Number.isFinite(after) || after <= 0) throw new Error('A Gmail capture cutoff is required.');
  const query = new URLSearchParams({
    q: `after:${Math.floor(after / 1000)}`,
    labelIds: 'INBOX',
    maxResults: '100',
  });
  if (pageToken) query.set('pageToken', pageToken);
  const result = await getJson<{ messages?: { id?: string }[]; nextPageToken?: string }>(
    token,
    `${API_ROOT}/messages?${query}`,
    signal,
  );
  return {
    ids: (result.messages ?? []).flatMap(message => (message.id ? [message.id] : [])),
    nextPageToken: result.nextPageToken,
  };
}

export type GmailMessageReadResult =
  | { status: 'ok'; message: GmailObservation }
  /** Durable skip: safe to advance the history cursor past this id. */
  | { status: 'skip'; reason: 'not_in_inbox' | 'missing_id' | 'invalid_received_time' }
  /** Retryable: do not advance history; a later sync may read the body. */
  | { status: 'retry'; reason: 'no_supported_plain_text' };

/** Read a message body; uncertain HTML-derived content is restricted to review. */
export async function readGmailMessage(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<GmailMessageReadResult> {
  const result = await getJson<GmailMessage>(
    token,
    `${API_ROOT}/messages/${encodeURIComponent(id)}?format=full`,
    signal,
  );
  if (!result.labelIds?.includes('INBOX')) {
    logger.debug('[Gmail] Message skipped', { reason: 'not_in_inbox' });
    return { status: 'skip', reason: 'not_in_inbox' };
  }
  const receivedAt = Number(result.internalDate);
  let plain = observationTextFromFull(result.payload);
  if (!plain && result.id) {
    const fromRaw = await observationTextFromRaw(token, id, signal);
    if (fromRaw) {
      plain = { text: fromRaw.text, primary: fromRaw.primary };
      logger.debug('[Gmail] MIME fallback selected', { source: fromRaw.source });
    }
  }
  if (!result.id) {
    logger.debug('[Gmail] Message skipped', { reason: 'missing_id' });
    return { status: 'skip', reason: 'missing_id' };
  }
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) {
    logger.debug('[Gmail] Message skipped', { reason: 'invalid_received_time' });
    return { status: 'skip', reason: 'invalid_received_time' };
  }
  if (!plain) {
    logger.debug('[Gmail] Message skipped', {
      reason: 'no_supported_plain_text',
      topLevelMimeType: result.payload?.mimeType,
      sizeEstimate: result.sizeEstimate,
    });
    return { status: 'retry', reason: 'no_supported_plain_text' };
  }
  logger.debug('[Gmail] Message body selected', {
    topLevelMimeType: result.payload?.mimeType,
    primaryPlainText: plain.primary,
    textLength: plain.text.length,
    sizeEstimate: result.sizeEstimate,
  });
  return {
    status: 'ok',
    message: {
      id: result.id,
      receivedAt,
      sender: header(result.payload, 'from'),
      subject: header(result.payload, 'subject'),
      internetMessageId: header(result.payload, 'message-id') || undefined,
      text: plain.text,
      primaryPlainText: plain.primary,
      topLevelMimeType: result.payload?.mimeType,
      sizeEstimate: typeof result.sizeEstimate === 'number' ? result.sizeEstimate : undefined,
    },
  };
}

/** The original RFC 5322 bytes are used only in memory for signature verification and MIME fallback. */
export async function readGmailRawMessage(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  const result = await getJson<{ id?: string; raw?: string }>(
    token,
    `${API_ROOT}/messages/${encodeURIComponent(id)}?format=raw`,
    signal,
  );
  if (result.id !== id || !result.raw || !isBase64UrlPayload(result.raw)) return null;
  const normalized = result.raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    return toByteArray(padded);
  } catch {
    return null;
  }
}
