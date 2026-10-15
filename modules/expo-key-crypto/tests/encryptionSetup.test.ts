import { closeNativeHost, memoryKeyHierarchy } from './nativeTestContext';
import { enableTestCrypto } from '@/src/services/backup/__tests__/snapshotTestHelpers';
import { EncryptionSetup } from '@/src/services/backup/encryptionSetup';
import type {
  EncryptionSetupStore,
  EncryptionSetupSession,
} from '@/src/services/backup/encryptionSetupStore';
import { parseEncryptionSetupSession } from '@/src/services/backup/encryptionSetupValidation';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
afterEach(closeNativeHost);
beforeEach(() => enableTestCrypto());

function storeFixture() {
  let session: EncryptionSetupSession | null = null;
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const store: EncryptionSetupStore = {
    loadSession: jest.fn(async () => (session ? copy(session) : null)),
    saveSession: jest.fn(async value => {
      session = copy(value);
    }),
  };
  return { store };
}

function setup() {
  const context = memoryKeyHierarchy();
  const persistence = storeFixture();
  const flow = new EncryptionSetup(context.hierarchy, persistence.store, () => undefined);
  return { ...context, ...persistence, flow };
}

it('inspects and confirms User and Workplace setup without persisting recovery credentials', async () => {
  const context = setup();
  const workplaceId = 'books';
  const userSecret = await context.flow.beginUser();
  expect((await context.flow.inspect(workplaceId)).keys?.user).toBe('pending');
  await expect(context.flow.beginWorkplace(workplaceId)).rejects.toThrow('User recovery');
  await expect(
    context.flow.confirmUser({ ...userSecret, handle: '00'.repeat(32) }),
  ).rejects.toThrow();
  expect((await context.flow.inspect(workplaceId)).keys?.user).toBe('pending');
  await context.flow.confirmUser(userSecret);
  expect((await context.flow.inspect(workplaceId)).keys?.user).toBe('ready');
  const workplaceSecret = await context.flow.beginWorkplace(workplaceId);
  expect((await context.flow.inspect(workplaceId)).keys?.workplace).toBe('pending');
  await expect(
    context.flow.confirmWorkplace(workplaceId, { ...workplaceSecret, handle: '00'.repeat(32) }),
  ).rejects.toThrow();
  expect((await context.flow.inspect(workplaceId)).keys?.workplace).toBe('pending');
  expect((await context.store.loadSession())?.verifiedWorkplaces).toBeUndefined();
  await context.flow.confirmWorkplace(workplaceId, workplaceSecret);
  expect((await context.flow.inspect(workplaceId)).keys?.workplace).toBe('ready');
  expect((await context.store.loadSession())?.verifiedWorkplaces).toEqual([
    { workplaceId, keyId: workplaceSecret.identityKeyId },
  ]);

  const persisted = JSON.stringify({
    session: await context.store.loadSession(),
    ciphertext: [...context.ciphertext.values()],
  });
  expect(persisted).not.toContain(userSecret.handle);
  expect(persisted).not.toContain(workplaceSecret.handle);
  expect(parseEncryptionSetupSession(JSON.parse(persisted).session)).toEqual(
    await context.store.loadSession(),
  );
});

it('does not trust a local binding whose confirmation checkpoint failed, and resumes explicit verification', async () => {
  const context = setup();
  const userSecret = await context.flow.beginUser();
  await context.flow.confirmUser(userSecret);
  const establishedSecret = await context.flow.beginWorkplace('books');
  await context.flow.confirmWorkplace('books', establishedSecret);
  const workplaceId = 'unconfirmed-binding';
  const secret = await context.flow.beginWorkplace(workplaceId);
  const checkpoint = await context.store.loadSession();
  jest.mocked(context.store.saveSession).mockRejectedValueOnce(new Error('checkpoint interrupted'));
  await expect(context.flow.confirmWorkplace(workplaceId, secret)).rejects.toThrow(
    'checkpoint interrupted',
  );
  // Native confirmation alone must not establish a durable setup binding.
  expect((await context.flow.inspect(workplaceId)).keys?.workplace).toBe('ready');
  expect(await context.store.loadSession()).toEqual(checkpoint);
  expect((await context.store.loadSession())?.verifiedWorkplaces).toEqual([
    { workplaceId: 'books', keyId: establishedSecret.identityKeyId },
  ]);

  const restarted = new EncryptionSetup(context.hierarchy, context.store, () => undefined);
  await restarted.confirmWorkplace(workplaceId, secret);
  const bindings = [
    { workplaceId: 'books', keyId: establishedSecret.identityKeyId },
    { workplaceId, keyId: secret.identityKeyId },
  ];
  expect((await context.store.loadSession())?.verifiedWorkplaces).toEqual(bindings);
  await restarted.confirmWorkplace(workplaceId, secret);
  expect((await context.store.loadSession())?.verifiedWorkplaces).toEqual(bindings);
});

it('accepts only public, uniquely scoped verified binding records with a pinned User identity', async () => {
  const context = setup();
  const userSecret = await context.flow.beginUser();
  await context.flow.confirmUser(userSecret);
  const workplaceSecret = await context.flow.beginWorkplace('books');
  await context.flow.confirmWorkplace('books', workplaceSecret);
  const session = (await context.store.loadSession())!;
  const bindings = session.verifiedWorkplaces!;
  expect(parseEncryptionSetupSession(session)).toEqual(session);
  for (const verifiedWorkplaces of [
    [...bindings, ...bindings],
    [{ ...bindings[0], phrase: userSecret.handle }],
    [{ ...bindings[0], keyId: 'raw-key-material' }],
  ]) {
    expect(() => parseEncryptionSetupSession({ ...session, verifiedWorkplaces })).toThrow(
      'Workplace binding',
    );
  }
  expect(() => parseEncryptionSetupSession({ ...session, userKeyFingerprint: undefined })).toThrow(
    'Workplace binding',
  );
});

it('never resets an established User or Workplace during discard and permits unfinished Workplace retry', async () => {
  const context = setup();
  const userSecret = await context.flow.beginUser();
  await context.flow.confirmUser(userSecret);
  const establishedSecret = await context.flow.beginWorkplace('books');
  await context.flow.confirmWorkplace('books', establishedSecret);

  await expect(context.flow.discardUnfinished('books')).rejects.toThrow('established');
  const pendingSecret = await context.flow.beginWorkplace('pending-books');
  await context.flow.discardUnfinished('pending-books');
  expect((await context.flow.inspect('pending-books')).keys?.workplace).toBe('missing');
  const replacement = await context.flow.beginWorkplace('pending-books');
  expect(replacement.identityKeyId).not.toBe(pendingSecret.identityKeyId);
  expect(replacement.identityId).toBe('pending-books');
  expect((await context.store.loadSession())?.userKeyFingerprint).toBe(userSecret.identityKeyId);
});

it('does not create a new User root when an interrupted recovery has a known identity', async () => {
  const context = setup();
  await context.store.saveSession({
    formatVersion: 1,
    intent: 'recover-user',
    userId: 'known',
    deviceId: 'fresh',
    userKeyFingerprint: `sha256:${'01'.repeat(32)}`,
  });
  expect((await context.flow.inspect()).keys?.user).toBe('recovery-required');
  await expect(context.flow.beginUser()).rejects.toThrow('new root');
  await expect(context.flow.discardUnfinished()).rejects.toThrow('Known User');
  expect(context.deviceTags.size).toBe(0);
  expect(context.ciphertext.size).toBe(0);
});

it('rejects package and recovery progress fields from the durable setup record', () => {
  const valid = {
    formatVersion: 1,
    intent: 'create-user',
    userId: 'alice',
    deviceId: 'phone',
  };
  expect(() => parseEncryptionSetupSession({ ...valid, package: {} })).toThrow();
  expect(() => parseEncryptionSetupSession({ ...valid, pendingCompletion: {} })).toThrow();
  expect(() => parseEncryptionSetupSession({ ...valid, pendingRecoveries: [] })).toThrow();
});
