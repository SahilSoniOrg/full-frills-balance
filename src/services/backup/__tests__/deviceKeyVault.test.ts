import { deviceKeyVault } from '../deviceKeyVault.native';
import { nativeKeyOperations } from '../nativeKeyOperations';

jest.mock('../nativeKeyOperations', () => ({
  nativeKeyOperations: { hasKey: jest.fn(), removeKey: jest.fn() },
}));
beforeEach(() => jest.clearAllMocks());
it('exposes only key-presence metadata and removal, never raw read/write', async () => {
  expect(Object.keys(deviceKeyVault).sort()).toEqual(['has', 'remove']);
  jest.mocked(nativeKeyOperations.hasKey).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await deviceKeyVault.has('alice', 'phone')).toBe(true);
  expect(await deviceKeyVault.has('alice', 'replacement')).toBe(false);
  expect(nativeKeyOperations.hasKey).toHaveBeenNthCalledWith(1, {
    kind: 'device',
    userId: 'alice',
    deviceId: 'phone',
  });
  expect(nativeKeyOperations.hasKey).toHaveBeenNthCalledWith(2, {
    kind: 'device',
    userId: 'alice',
    deviceId: 'replacement',
  });
});
it('removes Device access using only scoped identifiers', async () => {
  await deviceKeyVault.remove('alice', 'phone');
  expect(nativeKeyOperations.removeKey).toHaveBeenCalledWith({
    kind: 'device',
    userId: 'alice',
    deviceId: 'phone',
  });
});
it('propagates native vault failures', async () => {
  jest.mocked(nativeKeyOperations.hasKey).mockRejectedValueOnce(new Error('locked'));
  await expect(deviceKeyVault.has('alice', 'phone')).rejects.toThrow('locked');
});
