import PlannedPayment from '@/src/data/models/PlannedPayment';
import { PlannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { WorkplaceId } from '@/src/types/domain';

describe('PlannedPaymentRepository', () => {
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
});
