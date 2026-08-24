import {
  createEmptyBudgetDraft,
  mapBudgetToEditDraft,
  shouldSeedBudgetDraft,
} from '../budgetEditDraft';
import { AccountId, BudgetId } from '@/src/types/ids';

describe('budgetEditDraft', () => {
  describe('shouldSeedBudgetDraft', () => {
    const budget = { id: 'b1' as BudgetId } as any;

    it('seeds when first non-null record arrives for an id', () => {
      expect(
        shouldSeedBudgetDraft({
          budgetId: 'b1' as BudgetId,
          seededBudgetId: null,
          observedBudget: budget,
          scopesReady: true,
        }),
      ).toBe(true);
    });

    it('does not re-seed the same id on later observe ticks', () => {
      expect(
        shouldSeedBudgetDraft({
          budgetId: 'b1' as BudgetId,
          seededBudgetId: 'b1' as BudgetId,
          observedBudget: budget,
          scopesReady: true,
        }),
      ).toBe(false);
    });

    it('re-seeds when budgetId changes', () => {
      expect(
        shouldSeedBudgetDraft({
          budgetId: 'b2' as BudgetId,
          seededBudgetId: 'b1' as BudgetId,
          observedBudget: { id: 'b2' as BudgetId } as any,
          scopesReady: true,
        }),
      ).toBe(true);
    });

    it('ignores stale observe emission for a different id', () => {
      expect(
        shouldSeedBudgetDraft({
          budgetId: 'b2' as BudgetId,
          seededBudgetId: null,
          observedBudget: budget, // still b1
          scopesReady: true,
        }),
      ).toBe(false);
    });

    it('waits until scopes are ready', () => {
      expect(
        shouldSeedBudgetDraft({
          budgetId: 'b1' as BudgetId,
          seededBudgetId: null,
          observedBudget: budget,
          scopesReady: false,
        }),
      ).toBe(false);
    });
  });

  describe('mapBudgetToEditDraft', () => {
    it('maps budget + scopes into form draft fields', () => {
      const budget = {
        name: 'Food',
        amount: 100.5,
        currencyCode: 'EUR',
        startMonth: '2026-03',
        intervalType: 'WEEKLY',
        intervalN: 2,
        recurrenceDay: 3,
        recurrenceMonth: 5,
        startDate: 123,
        assetAccountIds: 'a1,a2',
      } as any;
      const scopes = [{ accountId: 'e1' as AccountId }, { accountId: 'e2' as AccountId }] as any[];

      const draft = mapBudgetToEditDraft(budget, scopes, 'USD');
      expect(draft.name).toBe('Food');
      expect(draft.amount).toBe('100.5');
      expect(draft.currencyCode).toBe('EUR');
      expect(draft.startMonth.getFullYear()).toBe(2026);
      expect(draft.startMonth.getMonth()).toBe(2);
      expect(draft.intervalType).toBe('WEEKLY');
      expect(draft.intervalN).toBe(2);
      expect(draft.selectedAccountIds).toEqual(['e1', 'e2']);
      expect(draft.assetAccountIds).toEqual(['a1', 'a2']);
    });
  });

  describe('createEmptyBudgetDraft', () => {
    it('seeds create mode from preview params', () => {
      const draft = createEmptyBudgetDraft({
        name: 'Preview',
        amount: '10',
        currencyCode: 'USD',
      });
      expect(draft.name).toBe('Preview');
      expect(draft.amount).toBe('10');
      expect(draft.currencyCode).toBe('USD');
      expect(draft.selectedAccountIds).toEqual([]);
    });
  });
});
