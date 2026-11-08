import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { GmailDkimLookupError, verifyGmailDkim } from '../gmailDkimVerification';

// Exercise the message verifier with actual RSA operations while replacing only the native bridge.
jest.mock('../gmailDkimCrypto', () => {
  const crypto = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    sha256Base64: (data: Uint8Array) => crypto.createHash('sha256').update(data).digest('base64'),
    verifyRsaSha256: (key: string, data: Uint8Array, signature: Uint8Array) => {
      try {
        const publicKey = crypto.createPublicKey(
          `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`,
        );
        return crypto.createVerify('RSA-SHA256').update(data).verify(publicKey, signature);
      } catch {
        return false;
      }
    },
  };
});

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyData = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const receivedAt = Date.UTC(2026, 10, 6, 12);
const originalFetch = global.fetch;

function signedMessage(options: { body?: string; partial?: boolean; recipient?: string } = {}) {
  const body = options.body ?? 'INR 450 spent on card at MARKET. Ref 1234567890.\r\n';
  const headers = [
    'From: Bank <alerts@bank.example>',
    `To: ${options.recipient ?? 'user@example.com'}`,
    `Date: ${new Date(receivedAt).toUTCString()}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  const bodyHash = createHash('sha256').update(body).digest('base64');
  const signatureHeader = `DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple; d=bank.example; s=mail; h=from:to:date:content-type; bh=${bodyHash}; ${options.partial ? 'l=5; ' : ''}b=`;
  const signature = createSign('RSA-SHA256')
    .update(`${headers.join('\r\n')}\r\n${signatureHeader}`)
    .sign(privateKey, 'base64');
  return `${signatureHeader}${signature}\r\n${headers.join('\r\n')}\r\n\r\n${body}`;
}

function verify(raw: string, overrides: Partial<Parameters<typeof verifyGmailDkim>[0]> = {}) {
  return verifyGmailDkim({
    raw: new Uint8Array(Buffer.from(raw, 'binary')),
    sender: 'alerts@bank.example',
    recipient: 'user@example.com',
    receivedAt,
    topLevelMimeType: 'text/plain',
    ...overrides,
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      Status: 0,
      Answer: [{ type: 16, data: `"v=DKIM1; k=rsa; p=${publicKeyData}"` }],
    }),
  });
});
afterEach(() => {
  global.fetch = originalFetch;
});

it('accepts a complete signed message addressed to the connected account', async () => {
  await expect(verify(signedMessage())).resolves.toBe(true);
});

it('rejects modified content and a different recipient', async () => {
  await expect(verify(signedMessage().replace('450', '950'))).resolves.toBe(false);
  await expect(verify(signedMessage({ recipient: 'other@example.com' }))).resolves.toBe(false);
});

it('rejects partial-body signatures and unsigned MIME interpretation', async () => {
  await expect(verify(signedMessage({ partial: true }))).resolves.toBe(false);
  await expect(
    verify(signedMessage().replace('Content-Type: text/plain', 'Content-Type: text/html')),
  ).resolves.toBe(false);
});

it('retries transient DNS failures without treating them as an invalid signature', async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(verify(signedMessage())).rejects.toBeInstanceOf(GmailDkimLookupError);
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(verify(signedMessage())).rejects.toBeInstanceOf(GmailDkimLookupError);
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ Status: 2 }),
  });
  await expect(verify(signedMessage())).rejects.toBeInstanceOf(GmailDkimLookupError);
});

it('rejects nonexistent keys and a replay outside the accepted date window', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ Status: 3 }),
  });
  await expect(verify(signedMessage())).resolves.toBe(false);
  await expect(
    verify(signedMessage(), { receivedAt: receivedAt + 48 * 60 * 60 * 1000 }),
  ).resolves.toBe(false);
});
