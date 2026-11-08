import { toByteArray } from 'base64-js';
import { sha256Base64, verifyRsaSha256 } from './gmailDkimCrypto';
import { singleMailboxAddress } from './mailboxAddress';

interface Header {
  name: string;
  raw: string;
  value: string;
}
interface ParsedMessage {
  headers: Header[];
  body: string;
}

/** A transient lookup failure must not permanently disposition the message. */
export class GmailDkimLookupError extends Error {
  constructor() {
    super('Unable to verify the email sender right now.');
    this.name = 'GmailDkimLookupError';
  }
}

/** Preserve octets for DKIM; converting the MIME message to UTF-8 would change its signature. */
function bytesToBinary(bytes: Uint8Array): string {
  let result = '';
  for (let start = 0; start < bytes.length; start += 4096) {
    result += String.fromCharCode(...bytes.subarray(start, start + 4096));
  }
  return result;
}

function binaryToBytes(value: string): Uint8Array {
  return Uint8Array.from(value, char => char.charCodeAt(0));
}

function parseMessage(bytes: Uint8Array): ParsedMessage | null {
  const raw = bytesToBinary(bytes);
  const separator = raw.indexOf('\r\n\r\n');
  if (separator < 0 || separator > 32768) return null;
  const headerText = raw.slice(0, separator);
  const body = raw.slice(separator + 4);
  if (
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]/.test(headerText) ||
    /(?:^|[^\r])\n|\r(?!\n)/.test(headerText) ||
    /(?:^|[^\r])\n|\r(?!\n)/.test(body)
  )
    return null;
  const headers: Header[] = [];
  for (const line of headerText.split('\r\n')) {
    if (/^[ \t]/.test(line)) {
      const previous = headers[headers.length - 1];
      if (!previous) return null;
      previous.raw += `\r\n${line}`;
      previous.value += `\r\n${line}`;
      continue;
    }
    const match = line.match(/^([!-9;-~]+):(.*)$/);
    if (!match || headers.length >= 200) return null;
    headers.push({ name: match[1].toLowerCase(), raw: line, value: match[2] });
  }
  return { headers, body };
}

function tags(value: string): Map<string, string> | null {
  const result = new Map<string, string>();
  for (const part of value.replace(/\r\n[ \t]+/g, ' ').split(';')) {
    if (!part.trim()) continue;
    const match = part.trim().match(/^([a-z][a-z0-9_]*)[ \t]*=[ \t]*(.*)$/i);
    if (!match || result.has(match[1].toLowerCase())) return null;
    result.set(match[1].toLowerCase(), match[2].trim());
  }
  return result;
}

function oneHeader(headers: Header[], name: string): Header | undefined {
  const matches = headers.filter(header => header.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

function canonicalHeader(header: Header, mode: string): string {
  if (mode === 'simple') return header.raw;
  return `${header.name}:${header.value
    .replace(/\r\n[ \t]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()}`;
}

function canonicalBody(body: string, mode: string): string {
  if (mode === 'simple') return `${body.replace(/(?:\r\n)*$/, '')}\r\n`;
  const lines = body.split('\r\n').map(line => line.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.length ? `${lines.join('\r\n')}\r\n` : '';
}

function base64(value: string): Uint8Array | null {
  const compact = value.replace(/[ \t\r\n]/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  try {
    return toByteArray(compact);
  } catch {
    return null;
  }
}

/** Google DNS receives only the public selector and domain, never message text or access tokens. */
async function resolveKey(
  selector: string,
  domain: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const name = `${selector}._domainkey.${domain}`;
  const url = `https://dns.google/resolve?${new URLSearchParams({ name, type: 'TXT' })}`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) throw new GmailDkimLookupError();
      return null;
    }
    const result = (await response.json()) as {
      Status?: number;
      Answer?: { type?: number; data?: string }[];
    };
    if (result.Status === 3) return null;
    if (result.Status !== 0) throw new GmailDkimLookupError();
    if (!Array.isArray(result.Answer)) return null;
    const records = result.Answer.filter(
      answer => answer.type === 16 && typeof answer.data === 'string',
    );
    if (records.length !== 1) return null;
    const raw = records[0].data!;
    if (!/^"[^"\\]*"(?:\s+"[^"\\]*")*$/.test(raw)) return null;
    const parsed = tags(raw.slice(1, -1).replace(/"\s+"/g, ''));
    if (
      !parsed ||
      (parsed.has('v') && parsed.get('v')?.toUpperCase() !== 'DKIM1') ||
      (parsed.has('k') && parsed.get('k')?.toLowerCase() !== 'rsa') ||
      (parsed.has('h') && !parsed.get('h')!.toLowerCase().split(':').includes('sha256')) ||
      (parsed.has('s') &&
        !parsed
          .get('s')!
          .toLowerCase()
          .split(':')
          .some(value => value === '*' || value === 'email')) ||
      parsed.get('t')?.toLowerCase().split(':').includes('y')
    )
      return null;
    const publicKey = parsed.get('p')?.replace(/[ \t]/g, '');
    return publicKey && base64(publicKey) ? publicKey : null;
  } catch {
    throw new GmailDkimLookupError();
  }
}

/** Verify a deliberately small DKIM subset. Any ambiguity is review-only. */
export async function verifyGmailDkim(input: {
  raw: Uint8Array;
  sender: string;
  recipient: string;
  receivedAt: number;
  topLevelMimeType?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const message = parseMessage(input.raw);
  if (!message || input.signal?.aborted) return false;
  const from = oneHeader(message.headers, 'from');
  const to = oneHeader(message.headers, 'to');
  const date = oneHeader(message.headers, 'date');
  const contentType = oneHeader(message.headers, 'content-type');
  const sender = from && singleMailboxAddress(from.value);
  const recipient = to && singleMailboxAddress(to.value);
  const expectedSender = singleMailboxAddress(input.sender);
  const expectedRecipient = singleMailboxAddress(input.recipient);
  if (
    !sender ||
    !recipient ||
    sender !== expectedSender ||
    recipient !== expectedRecipient ||
    !date ||
    !contentType
  )
    return false;
  if (
    !input.topLevelMimeType ||
    contentType.value
      .replace(/\r\n[ \t]+/g, ' ')
      .split(';')[0]
      .trim()
      .toLowerCase() !== input.topLevelMimeType.toLowerCase()
  )
    return false;
  const sentAt = Date.parse(date.value.replace(/\r\n[ \t]+/g, ' ').trim());
  if (!Number.isFinite(sentAt) || Math.abs(input.receivedAt - sentAt) > 24 * 60 * 60 * 1000)
    return false;
  const senderDomain = sender.slice(sender.lastIndexOf('@') + 1);
  const signatures = message.headers.filter(header => header.name === 'dkim-signature');
  if (signatures.length === 0 || signatures.length > 5) return false;
  let lookupFailed = false;
  for (const signature of signatures) {
    const values = tags(signature.value);
    if (
      !values ||
      values.get('v') !== '1' ||
      values.get('a')?.toLowerCase() !== 'rsa-sha256' ||
      values.get('d')?.toLowerCase() !== senderDomain ||
      values.has('l')
    )
      continue;
    const selector = values.get('s')?.toLowerCase();
    if (
      !selector ||
      selector.length > 120 ||
      !selector.split('.').every(label => /^[a-z0-9_-]{1,63}$/.test(label))
    )
      continue;
    const identity = values.get('i');
    if (identity && identity.slice(identity.lastIndexOf('@') + 1).toLowerCase() !== senderDomain)
      continue;
    if (
      values.has('x') &&
      (!/^\d+$/.test(values.get('x')!) || Number(values.get('x')) * 1000 < Date.now())
    )
      continue;
    const modes = (values.get('c') ?? 'simple/simple').toLowerCase().split('/');
    const headerMode = modes[0];
    const bodyMode = modes[1] ?? 'simple';
    if (
      modes.length > 2 ||
      !['simple', 'relaxed'].includes(headerMode) ||
      !['simple', 'relaxed'].includes(bodyMode)
    )
      continue;
    const names = values
      .get('h')
      ?.toLowerCase()
      .split(':')
      .map(name => name.trim());
    if (!names?.length || names.some(name => !/^[!-9;-~]+$/.test(name))) continue;
    const critical = ['from', 'to', 'date', 'content-type'];
    for (const name of ['mime-version', 'content-transfer-encoding', 'content-disposition']) {
      const count = message.headers.filter(header => header.name === name).length;
      if (count > 1) {
        critical.push('!invalid');
        break;
      }
      if (count === 1) critical.push(name);
    }
    if (critical.some(name => !names.includes(name))) continue;
    const bodyHash = values.get('bh')?.replace(/[ \t]/g, '');
    const signatureBytes = base64(values.get('b') ?? '');
    if (
      !bodyHash ||
      !signatureBytes ||
      sha256Base64(binaryToBytes(canonicalBody(message.body, bodyMode))) !== bodyHash
    )
      continue;
    const used = new Set<Header>();
    let signed = '';
    for (const name of names) {
      const header = [...message.headers]
        .reverse()
        .find(
          candidate => candidate !== signature && candidate.name === name && !used.has(candidate),
        );
      if (header) {
        used.add(header);
        signed += `${canonicalHeader(header, headerMode)}\r\n`;
      }
    }
    const blanked = signature.value.replace(/((?:^|;)[ \t\r\n]*b[ \t\r\n]*=)[^;]*/i, '$1');
    if (blanked === signature.value) continue;
    signed += canonicalHeader(
      {
        ...signature,
        raw: `${signature.raw.slice(0, signature.raw.indexOf(':') + 1)}${blanked}`,
        value: blanked,
      },
      headerMode,
    );
    let key: string | null;
    try {
      key = await resolveKey(selector, senderDomain, input.signal);
    } catch (error) {
      if (input.signal?.aborted) return false;
      if (!(error instanceof GmailDkimLookupError)) throw error;
      lookupFailed = true;
      continue;
    }
    if (input.signal?.aborted) return false;
    if (key && verifyRsaSha256(key, binaryToBytes(signed), signatureBytes)) return true;
  }
  if (lookupFailed) throw new GmailDkimLookupError();
  return false;
}
