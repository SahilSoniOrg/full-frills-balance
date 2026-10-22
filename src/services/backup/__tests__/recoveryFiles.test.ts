import { enableTestCrypto } from './keyTestHelpers';
import { Platform } from 'react-native';
import { nativeKeyOperations } from '../nativeKeyOperations';
import { recoveryFiles } from '../recoveryFiles.native';

jest.mock('../nativeKeyOperations', () => ({
  nativeKeyOperations: {
    pickCredential: jest.fn(),
    exportCredential: jest.fn(),
    clearCredentials: jest.fn(),
  },
}));
const mockSecret = {
  format: 'full-frills-recovery-handle',
  formatVersion: 1,
  purpose: 'user-recovery',
  identityId: 'alice',
  identityKeyId: `sha256:${'01'.repeat(32)}`,
  recoveryKeyId: `sha256:${'02'.repeat(32)}`,
  handle: 'ab'.repeat(32),
};
beforeEach(() => {
  enableTestCrypto();
  jest.clearAllMocks();
});

it.each(['ios', 'android'] as const)(
  'delegates credential export and selection entirely to native on %s',
  async platform => {
    Platform.OS = platform;
    jest.mocked(nativeKeyOperations.exportCredential).mockResolvedValueOnce(true);
    jest.mocked(nativeKeyOperations.pickCredential).mockResolvedValueOnce(mockSecret);
    expect(await recoveryFiles.exportSecret(mockSecret)).toBe(true);
    expect(await recoveryFiles.pickSecret()).toEqual(mockSecret);
  },
);
it('propagates native picker cancellation without producing a recovery handle', async () => {
  jest.mocked(nativeKeyOperations.exportCredential).mockResolvedValueOnce(false);
  jest.mocked(nativeKeyOperations.pickCredential).mockResolvedValueOnce(null);
  expect(await recoveryFiles.exportSecret(mockSecret)).toBe(false);
  expect(await recoveryFiles.pickSecret()).toBeNull();
});
it('rejects raw credential contents returned by an invalid native bridge', async () => {
  jest.mocked(nativeKeyOperations.pickCredential).mockResolvedValueOnce({ phrase: 'secret' });
  await expect(recoveryFiles.pickSecret()).rejects.toThrow();
});
it('clears native recovery handles', async () => {
  await recoveryFiles.cleanupTemporarySecrets();
  expect(nativeKeyOperations.clearCredentials).toHaveBeenCalled();
});
