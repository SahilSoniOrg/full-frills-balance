import PlannedPayment from '@/src/data/models/PlannedPayment';
import { PlannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { WorkplaceId } from '@/src/types/ids';

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
});
