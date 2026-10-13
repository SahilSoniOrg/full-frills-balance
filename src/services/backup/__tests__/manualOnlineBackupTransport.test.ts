import { randomBytes } from 'node:crypto';
import { encryptWorkplaceSnapshot, snapshotFingerprint } from '../encryptedSnapshot';
import {
  FetchManualBackupTransport,
  type DeviceChallengeProvider,
  type FetchLike,
} from '../manualOnlineBackupTransport';
import type { TrustedBackupIdentity } from '../manualOnlineBackup';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { enableTestCrypto, seedSnapshotWorkplace } from './snapshotTestHelpers';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
const TIME = 100000;
function identity(): TrustedBackupIdentity {
  return {
    userId: 'owner',
    accessToken: 'test-token',
    registeredDeviceId: 'device',
    userKeyFingerprint: 'anchor',
    userKeyAnchorVerified: true,
    deviceRegistrationVerified: true,
    signRequest: jest.fn(async () => 'signature'),
  };
}
function response(value: unknown, declared?: string): Response {
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: { get: () => declared ?? null },
    body: {
      getReader: () => ({
        read: async () =>
          sent
            ? { done: true }
            : ((sent = true),
              { done: false, value: new TextEncoder().encode(JSON.stringify(value)) }),
        cancel: jest.fn(),
        releaseLock: jest.fn(),
      }),
    },
  } as unknown as Response;
}
async function uploadInput() {
  const { snapshot } = await seedSnapshotWorkplace();
  const envelope = await encryptWorkplaceSnapshot(snapshot, new Uint8Array(randomBytes(32)));
  return {
    identity: identity(),
    workplaceId: envelope.workplaceId,
    envelope,
    contentHash: await snapshotFingerprint(JSON.stringify(envelope)),
    idempotencyKey: envelope.snapshotId,
    assertAuthorized: jest.fn(async () => undefined),
    assertDispatchAllowed: jest.fn(),
  };
}
function challenges(): DeviceChallengeProvider {
  let sequence = 0;
  return {
    getChallenge: jest.fn(async () => ({
      nonce: (++sequence).toString(16).padStart(64, '0'),
      issuedAt: TIME,
      expiresAt: TIME + 60000,
    })),
  };
}
beforeEach(async () => {
  enableTestCrypto();
  await resetDatabase();
});

it.each([
  '',
  'broken',
  'http://localhost',
  'http://backup.example',
  'https://user:secret@backup.example',
  'https://backup.example?token=x',
])('fails closed for invalid/unconfigured URL %s', async url => {
  const fetcher: FetchLike = jest.fn();
  const transport = new FetchManualBackupTransport(url, fetcher, challenges(), () => TIME);
  expect(transport.configured).toBe(false);
  await expect(transport.upload(await uploadInput())).rejects.toThrow('not configured');
  expect(fetcher).not.toHaveBeenCalled();
});
it('URL alone cannot enable registered-device transport', async () => {
  const fetcher: FetchLike = jest.fn();
  const transport = new FetchManualBackupTransport('https://backup.example', fetcher);
  expect(transport.configured).toBe(false);
  await expect(transport.upload(await uploadInput())).rejects.toThrow('protocol');
  expect(fetcher).not.toHaveBeenCalled();
});
it('signs exact scoped fresh bytes and keeps immutable retry identity separate from the challenge', async () => {
  const input = await uploadInput();
  const fetcher: FetchLike = jest.fn(async () =>
    response({ snapshotId: input.envelope.snapshotId, contentHash: input.contentHash }),
  );
  const provider = challenges();
  const transport = new FetchManualBackupTransport(
    'https://backup.example/api',
    fetcher,
    provider,
    () => TIME,
  );
  await transport.upload(input);
  await transport.upload(input);
  const body = JSON.stringify({ envelope: input.envelope, contentHash: input.contentHash });
  const path = `/api/v1/manual-backups/workplaces/${input.workplaceId}/snapshots/${input.envelope.snapshotId}`;
  const hash = await snapshotFingerprint(body);
  expect(input.identity.signRequest).toHaveBeenNthCalledWith(
    1,
    JSON.stringify([
      'ffb-manual-backup-device-request',
      1,
      'owner',
      'device',
      'anchor',
      'PUT',
      path,
      hash,
      input.envelope.snapshotId,
      '0'.repeat(63) + '1',
      TIME,
      TIME + 60000,
    ]),
  );
  expect(input.identity.signRequest).toHaveBeenNthCalledWith(
    2,
    JSON.stringify([
      'ffb-manual-backup-device-request',
      1,
      'owner',
      'device',
      'anchor',
      'PUT',
      path,
      hash,
      input.envelope.snapshotId,
      '0'.repeat(63) + '2',
      TIME,
      TIME + 60000,
    ]),
  );
  const first = jest.mocked(fetcher).mock.calls[0][1]!;
  const second = jest.mocked(fetcher).mock.calls[1][1]!;
  expect(first.body).toBe(second.body);
  expect(first.redirect).toBe('error');
  expect(first.headers).toMatchObject({
    Authorization: 'Bearer test-token',
    'X-Account-Id': 'owner',
    'X-Device-Id': 'device',
    'X-User-Key-Fingerprint': 'anchor',
    'Idempotency-Key': input.envelope.snapshotId,
  });
  expect(input.assertAuthorized).toHaveBeenCalledTimes(2);
  expect(input.assertDispatchAllowed).toHaveBeenCalledTimes(2);
});
it('rejects expired/reused challenges and signs GET with identity and freshness', async () => {
  const input = await uploadInput();
  const fetcher: FetchLike = jest.fn(async () =>
    response({
      ownerUserId: 'owner',
      workplaceId: input.workplaceId,
      userKeyFingerprint: 'anchor',
      envelope: input.envelope,
      contentHash: input.contentHash,
    }),
  );
  const provider = {
    getChallenge: jest.fn(async () => ({
      nonce: 'ab'.repeat(32),
      issuedAt: TIME,
      expiresAt: TIME + 1,
    })),
  };
  const transport = new FetchManualBackupTransport(
    'https://backup.example',
    fetcher,
    provider,
    () => TIME,
  );
  await transport.downloadLatest(input);
  expect(input.identity.signRequest).toHaveBeenCalledWith(
    JSON.stringify([
      'ffb-manual-backup-device-request',
      1,
      'owner',
      'device',
      'anchor',
      'GET',
      `/v1/manual-backups/workplaces/${input.workplaceId}/latest`,
      '',
      '',
      'ab'.repeat(32),
      TIME,
      TIME + 1,
    ]),
  );
  await expect(transport.downloadLatest(input)).rejects.toThrow('reused');
  const expired = new FetchManualBackupTransport(
    'https://backup.example',
    fetcher,
    provider,
    () => TIME + 1,
  );
  await expect(expired.downloadLatest(input)).rejects.toThrow('Expired');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('checks authorization after signing and immediately before dispatch', async () => {
  const input = await uploadInput();
  const fetcher: FetchLike = jest.fn();
  const transport = new FetchManualBackupTransport(
    'https://backup.example',
    fetcher,
    challenges(),
    () => TIME,
  );
  input.assertAuthorized.mockRejectedValueOnce(new Error('session changed'));
  await expect(transport.upload(input)).rejects.toThrow('session changed');
  input.assertDispatchAllowed.mockImplementationOnce(() => {
    throw new Error('revoked');
  });
  await expect(transport.upload(input)).rejects.toThrow('revoked');
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects acknowledgements of different content and oversized responses before parsing', async () => {
  const input = await uploadInput();
  const fetcher: FetchLike = jest.fn(async () =>
    response({ snapshotId: 'wrong', contentHash: input.contentHash }),
  );
  const transport = new FetchManualBackupTransport(
    'https://backup.example',
    fetcher,
    challenges(),
    () => TIME,
  );
  await expect(transport.upload(input)).rejects.toThrow('different snapshot');
  jest.mocked(fetcher).mockResolvedValueOnce(response('x'.repeat(4096)));
  await expect(transport.upload(input)).rejects.toThrow('oversized');
  jest.mocked(fetcher).mockResolvedValueOnce(response({}, '4097'));
  await expect(transport.upload(input)).rejects.toThrow('oversized');
  jest.mocked(fetcher).mockResolvedValueOnce({
    ok: true,
    headers: { get: () => null },
    body: null,
  } as unknown as Response);
  await expect(transport.upload(input)).rejects.toThrow('streaming is unavailable');
});
it.each(['ownerUserId', 'workplaceId', 'userKeyFingerprint'])(
  'rejects downloaded %s scope mismatch',
  async field => {
    const input = await uploadInput();
    const fetcher: FetchLike = jest.fn(async () =>
      response({
        ownerUserId: 'owner',
        workplaceId: input.workplaceId,
        userKeyFingerprint: 'anchor',
        envelope: input.envelope,
        contentHash: input.contentHash,
        [field]: 'different',
      }),
    );
    await expect(
      new FetchManualBackupTransport(
        'https://backup.example',
        fetcher,
        challenges(),
        () => TIME,
      ).downloadLatest(input),
    ).rejects.toThrow('scope');
  },
);
