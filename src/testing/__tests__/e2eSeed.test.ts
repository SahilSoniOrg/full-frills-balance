import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { storage } from '@/src/utils/storage';
import { executeE2eBootstrap } from '../e2eSeed';
import { assertE2eHarnessEnabled } from '../e2eRuntimeGate';

jest.mock('../e2eRuntimeGate', () => ({
  assertE2eHarnessEnabled: jest.fn(),
}));

describe('executeE2eBootstrap', () => {
  it('checks the build capability before mutating storage or the database', async () => {
    (assertE2eHarnessEnabled as jest.Mock).mockImplementation(() => {
      throw new Error('[E2E] Harness capability is disabled for this build');
    });
    const clearAll = jest.spyOn(storage, 'clearAll');
    const resetDatabase = jest.spyOn(databaseRepository, 'resetDatabase');

    await expect(executeE2eBootstrap({ reset: true })).rejects.toThrow(
      'Harness capability is disabled',
    );

    expect(clearAll).not.toHaveBeenCalled();
    expect(resetDatabase).not.toHaveBeenCalled();
    clearAll.mockRestore();
    resetDatabase.mockRestore();
  });
});
