import { deviceKeyVault } from '../deviceKeyVault.native';
import { nativeKeyOperations } from '../nativeKeyOperations';

jest.mock('../nativeKeyOperations', () => ({ nativeKeyOperations: { execute: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
it('exposes only key-presence metadata and removal, never raw read/write', async () => {
  expect(Object.keys(deviceKeyVault).sort()).toEqual(['has', 'remove']);
  jest.mocked(nativeKeyOperations.execute).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await deviceKeyVault.has('alice', 'phone')).toBe(true);
  expect(await deviceKeyVault.has('alice', 'replacement')).toBe(false);
  expect(nativeKeyOperations.execute).toHaveBeenNthCalledWith(1, 'hasDevice', {
    userId: 'alice',
    deviceId: 'phone',
  });
  expect(nativeKeyOperations.execute).toHaveBeenNthCalledWith(2, 'hasDevice', {
    userId: 'alice',
    deviceId: 'replacement',
  });
});
it('removes Device access using only scoped identifiers', async () => {
  await deviceKeyVault.remove('alice', 'phone');
  expect(nativeKeyOperations.execute).toHaveBeenCalledWith('removeDevice', {
    userId: 'alice',
    deviceId: 'phone',
  });
});
it('propagates native vault failures and rejects non-boolean metadata', async () => {
  jest.mocked(nativeKeyOperations.execute).mockRejectedValueOnce(new Error('locked'));
  await expect(deviceKeyVault.has('alice', 'phone')).rejects.toThrow('locked');
  jest.mocked(nativeKeyOperations.execute).mockResolvedValueOnce(new Uint8Array(32));
  await expect(deviceKeyVault.has('alice', 'phone')).rejects.toThrow('Invalid native vault result');
});
