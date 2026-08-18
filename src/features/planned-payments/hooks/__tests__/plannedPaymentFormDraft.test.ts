import {
  createEmptyPlannedPaymentForm,
  mapPlannedPaymentToForm,
  shouldSeedPlannedPaymentDraft,
} from '../plannedPaymentFormDraft';
import { PlannedPaymentInterval, AccountId } from '@/src/types/domain';

describe('plannedPaymentFormDraft', () => {
  describe('shouldSeedPlannedPaymentDraft', () => {
    const item = { id: 'pp1' } as any;

    it('seeds when first non-null record arrives for an id', () => {
      expect(
        shouldSeedPlannedPaymentDraft({
          id: 'pp1',
          seededId: null,
          item,
        }),
      ).toBe(true);
    });

    it('does not re-seed the same id on later observe ticks', () => {
      expect(
        shouldSeedPlannedPaymentDraft({
          id: 'pp1',
          seededId: 'pp1',
          item,
        }),
      ).toBe(false);
    });

    it('re-seeds when id changes', () => {
      expect(
        shouldSeedPlannedPaymentDraft({
          id: 'pp2',
          seededId: 'pp1',
          item: { id: 'pp2' } as any,
        }),
      ).toBe(true);
    });

    it('ignores stale record after id change', () => {
      expect(
        shouldSeedPlannedPaymentDraft({
          id: 'pp2',
          seededId: null,
          item, // still pp1
        }),
      ).toBe(false);
    });
  });

  describe('mapPlannedPaymentToForm', () => {
    it('maps observed record into form draft', () => {
      const pp = {
        name: 'Rent',
        amount: 1200,
        currencyCode: 'USD',
        fromAccountId: 'from' as AccountId,
        toAccountId: 'to' as AccountId,
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        startDate: 1000,
        endDate: 2000,
        isAutoPost: true,
        recurrenceDay: 1,
        recurrenceMonth: undefined,
      } as any;

      const form = mapPlannedPaymentToForm(pp);
      expect(form.name).toBe('Rent');
      expect(form.amount).toBe('1200');
      expect(form.fromAccountId).toBe('from');
      expect(form.toAccountId).toBe('to');
      expect(form.isAutoPost).toBe(true);
    });
  });

  describe('createEmptyPlannedPaymentForm', () => {
    it('uses workplace currency for create mode', () => {
      const form = createEmptyPlannedPaymentForm('EUR');
      expect(form.currencyCode).toBe('EUR');
      expect(form.name).toBe('');
    });
  });
});
