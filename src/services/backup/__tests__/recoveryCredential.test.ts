import { parseRecoveryCredential } from '../recoveryCredential';

const handle = {
  format: 'full-frills-recovery-handle',
  formatVersion: 1,
  purpose: 'user-recovery',
  identityId: 'synthetic-user',
  identityKeyId: `sha256:${'01'.repeat(32)}`,
  recoveryKeyId: `sha256:${'02'.repeat(32)}`,
  handle: '03'.repeat(32),
};

it('accepts only the public native handle representation', () => {
  expect(parseRecoveryCredential(handle)).toEqual(handle);
  expect(parseRecoveryCredential({ ...handle, purpose: 'workplace-dump' }).purpose).toBe(
    'workplace-dump',
  );
});

it('rejects serialized recovery secrets and secret-bearing or malformed handle objects', () => {
  const { handle: token, ...publicFields } = handle;
  for (const value of [
    { ...publicFields, format: 'full-frills-recovery-credential', phrase: '00'.repeat(38) },
    { ...handle, phrase: '00'.repeat(38) },
    { ...handle, privateKey: token },
    { ...handle, handle: 'short' },
    { ...handle, identityKeyId: 'invalid' },
    { ...handle, purpose: 'other' },
  ])
    expect(() => parseRecoveryCredential(value)).toThrow('Invalid recovery file');
});
