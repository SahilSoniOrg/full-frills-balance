/**
 * Integration tests for CurrencyInitService
 */

import { database } from '@/src/data/database/Database';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { CurrencyInitService } from '@/src/services/currency-init-service';

describe('CurrencyInitService', () => {
  let service: CurrencyInitService;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
    service = new CurrencyInitService();
    service.resetForTesting();
  });

  describe('initialize', () => {
    it('should populate currencies if table is empty', async () => {
      const countBefore = await currencyRepository.findAll();
      expect(countBefore.length).toBe(0);

      await service.initialize();

      const countAfter = await currencyRepository.findAll();
      expect(countAfter.length).toBeGreaterThan(0);

      const usd = await currencyRepository.findByCode('USD');
      expect(usd).toBeDefined();
      expect(usd?.name).toBe('US Dollar');
    });

    it('should do nothing if all currencies are present', async () => {
      // Initialize once
      await service.initialize();
      const countInitial = (await currencyRepository.findAll()).length;

      // Initialize again
      await service.initialize();
      const countFinal = (await currencyRepository.findAll()).length;

      expect(countFinal).toBe(countInitial);
    });

    it('should add missing currencies if new ones are introduced', async () => {
      await service.initialize();
      const allCurrencies = await currencyRepository.findAll();
      const initialCount = allCurrencies.length;

      // Simulate a "missing" currency by deleting one
      const currencyToDelete = allCurrencies[0];
      await database.write(async () => {
        await currencyToDelete.markAsDeleted();
        await currencyToDelete.destroyPermanently();
      });

      const countAfterDelete = (await currencyRepository.findAll()).length;
      expect(countAfterDelete).toBe(initialCount - 1);

      // Re-initialize should restore it
      await service.initialize();

      const countFinal = (await currencyRepository.findAll()).length;
      expect(countFinal).toBe(initialCount);
    });
  });
});
