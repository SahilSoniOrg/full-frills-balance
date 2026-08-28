import PlannedPayment from '@/src/data/models/PlannedPayment';
import { PlannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { AccountId, WorkplaceId } from '@/src/types/ids';

describe('PlannedPaymentRepository', () => {
  describe('prepareStatusUpdate', () => {
    it('prepares a scoped status update with an optional next occurrence', () => {
      const repository = new PlannedPaymentRepository();
      const prepareUpdate = jest.fn().mockReturnValue({ id: 'status-op' });
      const payment = {
        workplaceId: 'wp-local' as WorkplaceId,
        prepareUpdate,
      } as unknown as PlannedPayment;

      const operation = repository.prepareStatusUpdate(
        'wp-local' as WorkplaceId,
        payment,
        'ACTIVE' as any,
        42,
      );

      expect(operation).toEqual({ id: 'status-op' });
      expect(prepareUpdate).toHaveBeenCalledWith(expect.any(Function));
      const update = prepareUpdate.mock.calls[0][0];
      const record = { status: 'PAUSED', nextOccurrence: 1, updatedAt: undefined } as any;
      update(record);
      expect(record.status).toBe('ACTIVE');
      expect(record.nextOccurrence).toBe(42);
      expect(record.updatedAt).toBeInstanceOf(Date);
    });

    it('rejects a foreign model before preparing a status mutation', () => {
      const repository = new PlannedPaymentRepository();
      const prepareUpdate = jest.fn();
      const payment = {
        workplaceId: 'wp-foreign' as WorkplaceId,
        prepareUpdate,
      } as unknown as PlannedPayment;

      expect(() =>
        repository.prepareStatusUpdate('wp-local' as WorkplaceId, payment, 'PAUSED' as any),
      ).toThrow('Planned payment not found or does not belong to the workplace');
      expect(prepareUpdate).not.toHaveBeenCalled();
    });
  });

  describe('prepareDelete', () => {
    it('rejects a foreign model before preparing a mutation', () => {
      const repository = new PlannedPaymentRepository();
      const prepareUpdate = jest.fn();
      const payment = {
        workplaceId: 'wp-foreign' as WorkplaceId,
        prepareUpdate,
      } as unknown as PlannedPayment;

      expect(() => repository.prepareDelete('wp-local' as WorkplaceId, payment)).toThrow(
        'Planned payment not found or does not belong to the workplace',
      );
      expect(prepareUpdate).not.toHaveBeenCalled();
    });
  });

  describe('prepareMergeOperations', () => {
    it('deduplicates dual references while preserving query order and workplace scope', async () => {
      const repository = new PlannedPaymentRepository();
      const workplaceId = 'wp-local' as WorkplaceId;
      const sourceAccountIds = ['source-1', 'source-2'] as AccountId[];
      const targetAccountId = 'target' as AccountId;

      const makePayment = (
        id: string,
        fromAccountId: AccountId,
        toAccountId: AccountId,
      ): PlannedPayment => {
        const payment = {
          id,
          fromAccountId,
          toAccountId,
          prepareUpdate: jest.fn().mockImplementation((update: (record: any) => void) => {
            update(payment);
            return payment;
          }),
        };
        return payment as unknown as PlannedPayment;
      };

      const dual = makePayment('dual', sourceAccountIds[0], sourceAccountIds[1]);
      const fromOnly = makePayment('from-only', sourceAccountIds[0], 'other' as AccountId);
      const toOnly = makePayment('to-only', 'other' as AccountId, sourceAccountIds[1]);

      jest.spyOn(repository, 'findAllByFromAccountIds').mockResolvedValue([dual, fromOnly]);
      jest.spyOn(repository, 'findAllByToAccountIds').mockResolvedValue([dual, toOnly]);

      const operations = await repository.prepareMergeOperations(
        workplaceId,
        sourceAccountIds,
        targetAccountId,
      );

      expect(repository.findAllByFromAccountIds).toHaveBeenCalledWith(
        workplaceId,
        sourceAccountIds,
      );
      expect(repository.findAllByToAccountIds).toHaveBeenCalledWith(workplaceId, sourceAccountIds);
      expect(operations.map(operation => operation.id)).toEqual(['dual', 'from-only', 'to-only']);
      expect(dual.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(fromOnly.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(toOnly.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(dual.fromAccountId).toBe(targetAccountId);
      expect(dual.toAccountId).toBe(targetAccountId);
      expect(fromOnly.fromAccountId).toBe(targetAccountId);
      expect(fromOnly.toAccountId).toBe('other');
      expect(toOnly.fromAccountId).toBe('other');
      expect(toOnly.toAccountId).toBe(targetAccountId);
    });

    it('uses target payments for collision detection without preparing updates for them', () => {
      const repository = new PlannedPaymentRepository();
      const sourceAccountId = 'source' as AccountId;
      const targetAccountId = 'target' as AccountId;
      const payment = (id: string, accountId: AccountId) =>
        ({
          id,
          name: 'Rent',
          amount: 100,
          currencyCode: 'USD',
          fromAccountId: accountId,
          toAccountId: accountId,
          intervalN: 1,
          intervalType: 'MONTHLY',
          startDate: 1,
          nextOccurrence: 2,
          isAutoPost: true,
          prepareUpdate: jest.fn().mockReturnValue({ id }),
        }) as unknown as PlannedPayment;
      const source = payment('source-payment', sourceAccountId);
      const target = payment('target-payment', targetAccountId);

      repository.prepareLoadedMergeOperations(
        { sourceFrom: [source], sourceTo: [source], targetFrom: [target], targetTo: [target] },
        [sourceAccountId],
        targetAccountId,
      );

      expect(source.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(target.prepareUpdate).not.toHaveBeenCalled();
    });
  });
});
