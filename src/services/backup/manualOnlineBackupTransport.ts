import { snapshotFingerprint, parseEncryptedSnapshotEnvelope } from './encryptedSnapshot';
import type { ManualBackupTransport, TrustedBackupIdentity } from './manualOnlineBackupContracts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface DeviceRequestBinding {
  userId: string;
  deviceId: string;
  userKeyFingerprint: string;
  method: 'PUT' | 'GET';
  path: string;
  bodyHash: string;
  idempotencyKey: string;
}
export interface FreshDeviceChallenge {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}
/** Not implemented by this app. A reviewed auth adapter must obtain a server challenge bound to
 * this exact request/session/device, verify its origin, and enforce server expiry/single use.
 * Account login alone must never construct this adapter or replace the User trust anchor. */
export interface DeviceChallengeProvider {
  getChallenge(binding: DeviceRequestBinding): Promise<FreshDeviceChallenge>;
}
export function canonicalDeviceRequest(
  binding: DeviceRequestBinding,
  challenge: FreshDeviceChallenge,
): string {
  return JSON.stringify([
    'ffb-manual-backup-device-request',
    1,
    binding.userId,
    binding.deviceId,
    binding.userKeyFingerprint,
    binding.method,
    binding.path,
    binding.bodyHash,
    binding.idempotencyKey,
    challenge.nonce,
    challenge.issuedAt,
    challenge.expiresAt,
  ]);
}
function normalizedBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

const MAX_ENVELOPE_RESPONSE = 50 * 1024 * 1024;
/** Fail closed if streaming is unavailable; text() would allocate an unbounded response first.
 * Native streaming support is an explicit integration gate for the eventual auth/server adapter. */
async function boundedJson(response: Response, maximum: number): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum))
    throw new Error('Backup service response is oversized');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Bounded backup response streaming is unavailable');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error('Backup service response is oversized');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid backup service response');
  return value as Record<string, unknown>;
}

/** Dormant client adapter: URL alone cannot enable it. No challenge/auth provider exists in app. */
export class FetchManualBackupTransport implements ManualBackupTransport {
  private readonly baseUrl: string | null;
  private readonly usedChallenges = new Map<string, number>();
  constructor(
    configuredUrl: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly challenges?: DeviceChallengeProvider,
    private readonly now: () => number = Date.now,
  ) {
    this.baseUrl = normalizedBaseUrl(configuredUrl);
  }
  get configured(): boolean {
    return this.baseUrl !== null && this.challenges !== undefined;
  }

  async upload(input: Parameters<ManualBackupTransport['upload']>[0]) {
    if (
      input.envelope.workplaceId !== input.workplaceId ||
      input.idempotencyKey !== input.envelope.snapshotId ||
      input.contentHash !== (await snapshotFingerprint(JSON.stringify(input.envelope)))
    )
      throw new Error('Upload scope or immutable content identity mismatch');
    const path = `/v1/manual-backups/workplaces/${encodeURIComponent(input.workplaceId)}/snapshots/${encodeURIComponent(input.envelope.snapshotId)}`;
    const body = JSON.stringify({ envelope: input.envelope, contentHash: input.contentHash });
    if (new TextEncoder().encode(body).byteLength > MAX_ENVELOPE_RESPONSE)
      throw new Error('Upload is oversized');
    const result = object(
      await this.request(
        input.identity,
        'PUT',
        path,
        body,
        input.idempotencyKey,
        input.assertAuthorized,
        input.assertDispatchAllowed,
        4096,
      ),
    );
    if (result.snapshotId !== input.envelope.snapshotId || result.contentHash !== input.contentHash)
      throw new Error('Backup server acknowledged different snapshot content');
    return { snapshotId: input.envelope.snapshotId, contentHash: input.contentHash };
  }

  async downloadLatest(input: Parameters<ManualBackupTransport['downloadLatest']>[0]) {
    const path = `/v1/manual-backups/workplaces/${encodeURIComponent(input.workplaceId)}/latest`;
    const result = object(
      await this.request(
        input.identity,
        'GET',
        path,
        undefined,
        '',
        input.assertAuthorized,
        input.assertDispatchAllowed,
        MAX_ENVELOPE_RESPONSE,
      ),
    );
    const envelope = object(result.envelope);
    if (
      result.ownerUserId !== input.identity.userId ||
      result.workplaceId !== input.workplaceId ||
      result.userKeyFingerprint !== input.identity.userKeyFingerprint ||
      envelope.workplaceId !== input.workplaceId ||
      typeof result.contentHash !== 'string' ||
      result.contentHash !== (await snapshotFingerprint(JSON.stringify(envelope)))
    )
      throw new Error('Downloaded backup scope or content identity mismatch');
    // Full envelope/authenticated plaintext validation remains in decryptWorkplaceSnapshot.
    return {
      ownerUserId: input.identity.userId,
      workplaceId: input.workplaceId,
      userKeyFingerprint: input.identity.userKeyFingerprint,
      contentHash: result.contentHash,
      envelope: parseEncryptedSnapshotEnvelope(envelope),
    };
  }

  private async request(
    identity: TrustedBackupIdentity,
    method: 'PUT' | 'GET',
    path: string,
    body: string | undefined,
    idempotencyKey: string,
    assertAuthorized: () => Promise<void>,
    assertDispatchAllowed: () => void,
    maximum: number,
  ) {
    if (!this.baseUrl || !this.challenges)
      throw new Error('Online backup authentication protocol and service are not configured');
    if (
      identity.userKeyAnchorVerified !== true ||
      identity.deviceRegistrationVerified !== true ||
      !identity.userId ||
      !identity.accessToken ||
      !identity.registeredDeviceId ||
      !identity.userKeyFingerprint
    )
      throw new Error('Trusted registered Device identity is unavailable');
    const binding: DeviceRequestBinding = {
      userId: identity.userId,
      deviceId: identity.registeredDeviceId,
      userKeyFingerprint: identity.userKeyFingerprint,
      method,
      path: new URL(`${this.baseUrl}${path}`).pathname,
      bodyHash: body ? await snapshotFingerprint(body) : '',
      idempotencyKey,
    };
    const challenge = await this.challenges.getChallenge(binding);
    const time = this.now();
    for (const [nonce, expiry] of this.usedChallenges)
      if (expiry <= time) this.usedChallenges.delete(nonce);
    if (
      !/^[a-f0-9]{64}$/.test(challenge.nonce) ||
      !Number.isSafeInteger(challenge.issuedAt) ||
      !Number.isSafeInteger(challenge.expiresAt) ||
      challenge.issuedAt > time + 5000 ||
      challenge.expiresAt <= time ||
      challenge.expiresAt - challenge.issuedAt > 60000 ||
      challenge.expiresAt <= challenge.issuedAt ||
      this.usedChallenges.has(challenge.nonce)
    )
      throw new Error('Expired, invalid, or reused Device challenge');
    this.usedChallenges.set(challenge.nonce, challenge.expiresAt);
    const signature = await identity.signRequest(canonicalDeviceRequest(binding, challenge));
    if (!signature.trim() || this.now() >= challenge.expiresAt)
      throw new Error('Device signature is unavailable or expired');
    await assertAuthorized(); // Re-check account/session/consent after awaited challenge and signing.
    assertDispatchAllowed(); // No await between local revocation check and dispatch.
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${identity.accessToken}`,
        'X-Account-Id': identity.userId,
        'X-Device-Id': identity.registeredDeviceId,
        'X-User-Key-Fingerprint': identity.userKeyFingerprint,
        'X-Device-Signature': signature,
        'X-Device-Challenge': challenge.nonce,
        'X-Device-Issued-At': String(challenge.issuedAt),
        'X-Device-Expires-At': String(challenge.expiresAt),
        ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey } : {}),
      },
      body,
    });
    if (!response.ok) throw new Error(`Online backup request failed (${response.status})`);
    return boundedJson(response, maximum);
  }
}
