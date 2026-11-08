import { Parser } from 'htmlparser2';
import type { WorkplaceId } from '@/src/types/ids';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { gmailBinding } from './gmailConnection';
import { gmailAccessToken } from './gmailAuthorization';
import { readGmailPreview } from './gmailApi';

const allowed = new Set([
  'p',
  'div',
  'span',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'blockquote',
  'pre',
  'code',
]);
const voidTags = new Set(['br', 'hr']);
const excluded = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'template',
  'head',
]);
const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rebuild a small set of inert tags; attributes, links and remote resources are discarded. */
export function safeEmailHtml(content: string, kind: 'html' | 'text'): string {
  let body = '';
  if (kind === 'text') body = `<pre>${escapeText(content)}</pre>`;
  else {
    let blocked = 0;
    const parser = new Parser(
      {
        onopentag(name) {
          if (excluded.has(name)) {
            blocked++;
            return;
          }
          if (!blocked && allowed.has(name)) body += `<${name}>`;
        },
        ontext(text) {
          if (!blocked) body += escapeText(text);
        },
        onclosetag(name) {
          if (excluded.has(name)) {
            blocked = Math.max(0, blocked - 1);
            return;
          }
          if (!blocked && allowed.has(name) && !voidTags.has(name)) body += `</${name}>`;
        },
      },
      { decodeEntities: true },
    );
    parser.end(content);
  }
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:16px -apple-system, sans-serif;line-height:1.5;overflow-wrap:anywhere;color:#222;background:#fff;margin:16px}pre{white-space:pre-wrap}table{border-collapse:collapse;max-width:100%}td,th{padding:4px;vertical-align:top}</style></head><body>${body}</body></html>`;
}

export async function loadEmailPreview(
  workplaceId: WorkplaceId,
  messageId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<string> {
  const binding = gmailBinding(workplaceId);
  if (
    !binding ||
    sourceId !== `gmail:${hashLegacySmsFingerprint(`${binding.accountId}:${messageId}`)}`
  )
    throw new Error('This email is unavailable for the connected Gmail account.');
  const credentials = await gmailAccessToken();
  if (!credentials || credentials.accountId !== binding.accountId)
    throw new Error('Reconnect Gmail to view this email.');
  const preview = await readGmailPreview(credentials.accessToken, messageId, signal);
  const current = gmailBinding(workplaceId);
  if (
    signal?.aborted ||
    current?.accountId !== binding.accountId ||
    current.connectedAt !== binding.connectedAt
  )
    throw new Error('Gmail connection changed.');
  return safeEmailHtml(preview.content, preview.kind);
}
