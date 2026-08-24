/* eslint-disable import/first -- jest mocks must be hoisted before imports */
jest.mock('@/src/data/repositories/DatabaseRepository', () => ({
  databaseRepository: {
    swapStagedWorkplaceInto: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: {
    find: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/data/database/idGenerator', () => ({
  generator: jest.fn().mockReturnValue('staging-id'),
}));

jest.mock('@/src/services/integrity', () => ({
  integrityService: {
    resetWorkplace: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { integrityService } from '@/src/services/integrity';
import { commitStagedImport, discardImportStagingWorkplace } from '../importStaging';

describe('import staging lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (integrityService.resetWorkplace as jest.Mock).mockResolvedValue(undefined);
  });

  it('does not report a successful swap as failed when cleanup fails', async () => {
    (integrityService.resetWorkplace as jest.Mock).mockRejectedValueOnce(
      new Error('staging delete failed'),
    );

    await expect(
      commitStagedImport('target' as never, 'staging' as never),
    ).resolves.toBeUndefined();
    expect(databaseRepository.swapStagedWorkplaceInto).toHaveBeenCalledWith(
      'target',
      'staging',
      expect.any(Array),
    );
  });

  it('can resume cleanup after a transient failure', async () => {
    (integrityService.resetWorkplace as jest.Mock)
      .mockRejectedValueOnce(new Error('temporary cleanup failure'))
      .mockResolvedValueOnce(undefined);

    await expect(discardImportStagingWorkplace('staging' as never)).rejects.toThrow(
      'temporary cleanup failure',
    );
    await expect(discardImportStagingWorkplace('staging' as never)).resolves.toBeUndefined();
    expect(integrityService.resetWorkplace).toHaveBeenCalledTimes(2);
  });
});
