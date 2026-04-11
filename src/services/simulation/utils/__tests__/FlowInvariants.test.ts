import { assertValidFlow } from '../FlowInvariants';
import { Flow, FlowCategory, FlowSource } from '../../types';

describe('FlowInvariants', () => {
  const baseFlow = {
    amount: 100,
    dayOffset: 10,
    category: FlowCategory.EXPENSE,
    timeframe: 'FUTURE',
    label: 'Test Flow',
    origin: FlowSource.MANUAL,
    referenceId: 'test-ref',
  } as const;

  const validInflow: Flow = {
    ...baseFlow,
    kind: 'INFLOW',
    accountId: 'acc-1',
    category: FlowCategory.INCOME,
  };

  const validOutflow: Flow = {
    ...baseFlow,
    kind: 'OUTFLOW',
    accountId: 'acc-1',
    category: FlowCategory.BUDGET,
  };

  const validTransfer: Flow = {
    ...baseFlow,
    kind: 'TRANSFER',
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    category: FlowCategory.TRANSFER,
  };

  it('passes for valid inflows, outflows, and transfers', () => {
    expect(() => assertValidFlow(validInflow)).not.toThrow();
    expect(() => assertValidFlow(validOutflow)).not.toThrow();
    expect(() => assertValidFlow(validTransfer)).not.toThrow();
  });

  describe('Basic Data Invariants', () => {
    it('throws if label is missing', () => {
      const invalid = { ...validInflow, label: '' };
      expect(() => assertValidFlow(invalid)).toThrow('[FlowInvariant] Flow is missing label');
    });

    it('throws if origin is missing', () => {
      const invalid = { ...validInflow, origin: undefined as any };
      expect(() => assertValidFlow(invalid)).toThrow('[FlowInvariant] Flow is missing origin');
    });

    it('throws if amount is negative', () => {
      const invalid = { ...validInflow, amount: -50 };
      expect(() => assertValidFlow(invalid)).toThrow('[FlowInvariant] Negative amount found: -50');
    });

    it('throws if referenceId is missing', () => {
      const invalid = { ...validInflow, referenceId: undefined as any };
      expect(() => assertValidFlow(invalid)).toThrow('[FlowInvariant] Flow is missing referenceId');
    });
  });

  describe('Time Invariants', () => {
    it('throws if dayOffset < 0 but timeframe is FUTURE', () => {
      const invalid = { ...validInflow, dayOffset: -1, timeframe: 'FUTURE' as any };
      expect(() => assertValidFlow(invalid)).toThrow(
        "[FlowInvariant] Past dayOffset (-1) must have timeframe 'PAST'",
      );
    });

    it('throws if dayOffset >= 0 but timeframe is PAST', () => {
      const invalid = { ...validInflow, dayOffset: 5, timeframe: 'PAST' as any };
      expect(() => assertValidFlow(invalid)).toThrow(
        "[FlowInvariant] Future dayOffset (5) must have timeframe 'FUTURE'",
      );
    });
  });

  describe('Account Invariants', () => {
    it('throws if INFLOW is missing accountId', () => {
      const invalid = { ...validInflow, accountId: '' };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] INFLOW flow is missing accountId',
      );
    });

    it('throws if TRANSFER is missing fromAccountId', () => {
      const invalid = { ...validTransfer, fromAccountId: '' };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] Transfer flow is missing src/dest accounts',
      );
    });

    it('throws if self-transfer is detected', () => {
      const invalid = { ...validTransfer, fromAccountId: 'acc-1', toAccountId: 'acc-1' };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] Self-transfer detected: acc-1 -> acc-1',
      );
    });
  });

  describe('Semantic Invariants', () => {
    it('enforces BUDGET category only for OUTFLOW kind', () => {
      const invalid = { ...validOutflow, kind: 'INFLOW' as any };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] BUDGET category must always be an OUTFLOW kind',
      );
    });

    it('enforces INCOME category only for INFLOW kind', () => {
      const invalid = { ...validInflow, kind: 'OUTFLOW' as any };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] INCOME category must always be an INFLOW kind',
      );
    });

    it('enforces TRANSFER kind has TRANSFER or DEBT category', () => {
      const invalid = { ...validTransfer, category: FlowCategory.EXPENSE };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] TRANSFER kind must have category TRANSFER or DEBT',
      );
    });

    it('enforces source/category correlation for BUDGET', () => {
      const invalid = {
        ...validOutflow,
        origin: FlowSource.BUDGET,
        category: FlowCategory.EXPENSE,
      };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] BUDGET source must have BUDGET category',
      );
    });

    it('enforces source/category correlation for LIABILITY', () => {
      const invalid = {
        ...validOutflow,
        origin: FlowSource.LIABILITY,
        category: FlowCategory.EXPENSE,
      };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] LIABILITY source must have DEBT category',
      );
    });

    it('enforces valid categories for PLANNED_PAYMENT', () => {
      const invalid = {
        ...validOutflow,
        origin: FlowSource.PLANNED_PAYMENT,
        category: FlowCategory.BUDGET,
      };
      expect(() => assertValidFlow(invalid)).toThrow(
        '[FlowInvariant] PLANNED_PAYMENT source has invalid category',
      );
    });
  });

  describe('Resolution Metadata Invariants', () => {
    it('throws if resolvedFrom exists on a non-spend category', () => {
      const invalidSnippet = {
        ...validInflow,
        resolvedFrom: FlowSource.BUDGET,
      };
      expect(() => assertValidFlow(invalidSnippet)).toThrow(
        "[FlowInvariant] resolvedFrom 'BUDGET' is inconsistent with category 'INCOME'",
      );
    });

    it('allows resolvedFrom on BUDGET category', () => {
      const valid = { ...validOutflow, resolvedFrom: FlowSource.BUDGET };
      expect(() => assertValidFlow(valid)).not.toThrow();
    });
  });

  describe('Error Diagnostic Context', () => {
    it('includes a JSON block in the error message', () => {
      const invalid = { ...validInflow, amount: -1 };
      try {
        assertValidFlow(invalid);
      } catch (err: any) {
        expect(err.message).toContain('Context: {');
        expect(err.message).toContain('"amount": -1');
        expect(err.message).toContain('"label": "Test Flow"');
      }
    });
  });
});
