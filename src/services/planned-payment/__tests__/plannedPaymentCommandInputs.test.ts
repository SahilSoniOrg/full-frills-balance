import {
  normalizePlannedPaymentCommandInput,
  type PlannedPaymentCommandInput,
} from '../plannedPaymentCommandInputs';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { AccountId, asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';

const source = { id: 'from' as AccountId, currencyCode: 'USD' };
const destination = { id: 'to' as AccountId, currencyCode: 'EUR' };
const input: PlannedPaymentCommandInput = {
  name: 'Transfer',
  amount: 100,
  currencyCode: 'INR',
  fromAccountId: source.id,
  toAccountId: destination.id,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  startDate: Date.UTC(2026, 0, 1),
  isAutoPost: true,
};
const normalize = (value: PlannedPaymentCommandInput) =>
  normalizePlannedPaymentCommandInput(value, [source, destination]);

describe('planned payment FX command normalization', () => {
  it('preserves legacy third-currency input without defaulting its mode', () => {
    expect(normalize(input)).toBe(input);
    expect(normalize(input)).not.toHaveProperty('fxMode');
    expect(normalizePlannedPaymentCommandInput(input, [], { fxMode: undefined })).toBe(input);
  });

  it.each(['automatic', 'fixed', 'manual'] as const)(
    'derives source currency for explicit %s mode',
    fxMode => {
      expect(normalize({ ...input, fxMode, destinationAmount: 90 })).toMatchObject({
        fxMode,
        currencyCode: 'USD',
        amount: 100,
      });
    },
  );

  it.each(['automatic', 'fixed', 'manual'] as const)(
    'requires nonempty From and To accounts for explicit %s mode',
    fxMode => {
      for (const emptyId of [EMPTY_ACCOUNT_ID, asAccountId('   ')]) {
        expect(() =>
          normalize({ ...input, fxMode, fromAccountId: emptyId, destinationAmount: 90 }),
        ).toThrow('Choose a From account and a To account.');
        expect(() =>
          normalize({ ...input, fxMode, toAccountId: emptyId, destinationAmount: 90 }),
        ).toThrow('Choose a From account and a To account.');
      }
    },
  );

  it.each(['automatic', 'fixed', 'manual'] as const)(
    'rejects identical From and To accounts for explicit %s mode',
    fxMode => {
      expect(() =>
        normalize({
          ...input,
          fxMode,
          toAccountId: source.id,
          destinationAmount: 90,
        }),
      ).toThrow('From and To accounts must be different.');
    },
  );

  it.each(['automatic', 'fixed', 'manual'] as const)(
    'validates account selection when %s mode is inherited from an existing plan',
    fxMode => {
      const existing = { fxMode, destinationAmount: 90 };
      expect(() =>
        normalizePlannedPaymentCommandInput(
          { ...input, toAccountId: source.id },
          [source, destination],
          existing,
        ),
      ).toThrow('From and To accounts must be different.');
      expect(() =>
        normalizePlannedPaymentCommandInput(
          { ...input, toAccountId: EMPTY_ACCOUNT_ID },
          [source, destination],
          existing,
        ),
      ).toThrow('Choose a From account and a To account.');
    },
  );

  it('validates a legacy account edit when it selects automatic FX', () => {
    expect(() =>
      normalizePlannedPaymentCommandInput(
        { ...input, toAccountId: source.id },
        [source, destination],
        { fromAccountId: source.id, toAccountId: destination.id },
      ),
    ).toThrow('From and To accounts must be different.');
  });

  it.each([EMPTY_ACCOUNT_ID, source.id])(
    'preserves legacy normalization for To account %s',
    toAccountId => {
      const legacy = { ...input, toAccountId };
      expect(normalize(legacy)).toBe(legacy);
      expect(normalize(legacy).currencyCode).toBe('INR');
    },
  );

  it('retains both native amounts in fixed mode', () => {
    expect(normalize({ ...input, fxMode: 'fixed', destinationAmount: 90 })).toMatchObject({
      amount: 100,
      destinationAmount: 90,
      isAutoPost: true,
    });
  });

  it('clears a stale fixed amount for automatic FX', () => {
    expect(
      normalize({ ...input, fxMode: 'automatic', destinationAmount: 90 }).destinationAmount,
    ).toBeUndefined();
  });

  it('forces manual occurrence review even when auto-post was requested', () => {
    expect(normalize({ ...input, fxMode: 'manual' }).isAutoPost).toBe(false);
  });

  it('persists optional manual destination suggestion without authorizing auto-post', () => {
    expect(normalize({ ...input, fxMode: 'manual', destinationAmount: 90 })).toMatchObject({
      destinationAmount: 90,
      isAutoPost: false,
    });
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid manual destination suggestion %s', amount => {
    expect(() => normalize({ ...input, fxMode: 'manual', destinationAmount: amount })).toThrow(
      /positive destination amount suggestion/,
    );
  });

  it('keeps legacy currency on ordinary edit but selects automatic FX when an account changes', () => {
    const existing = { fromAccountId: source.id, toAccountId: destination.id };
    expect(normalizePlannedPaymentCommandInput(input, [source, destination], existing)).toBe(input);
    expect(
      normalizePlannedPaymentCommandInput(input, [source, destination], {
        ...existing,
        toAccountId: 'old-to' as AccountId,
      }),
    ).toMatchObject({ fxMode: 'automatic', currencyCode: 'USD' });
  });

  it.each(['fixed', 'manual'] as const)(
    'normalizes same-currency %s destination amounts to the source amount',
    fxMode => {
      expect(
        normalizePlannedPaymentCommandInput({ ...input, fxMode, destinationAmount: 90 }, [
          source,
          { ...destination, currencyCode: 'USD' },
        ]).destinationAmount,
      ).toBe(100);
      expect(
        normalizePlannedPaymentCommandInput({ ...input, fxMode }, [
          source,
          { ...destination, currencyCode: 'USD' },
        ]).destinationAmount,
      ).toBe(100);
    },
  );

  it.each([undefined, 0, -1, NaN, Infinity])(
    'rejects invalid fixed destination amount %s',
    amount => {
      expect(() => normalize({ ...input, fxMode: 'fixed', destinationAmount: amount })).toThrow(
        /positive destination amount/,
      );
    },
  );

  it.each([0, -1, NaN, Infinity])('rejects invalid explicit source amount %s', amount => {
    expect(() => normalize({ ...input, amount, fxMode: 'automatic' })).toThrow(
      /positive source amount/,
    );
  });

  it('rejects unsupported modes at runtime', () => {
    const invalid = JSON.parse(JSON.stringify({ ...input, fxMode: 'other' }));
    expect(() => normalize(invalid)).toThrow(/valid planned payment FX mode/);
  });

  it('requires a resolved source currency for explicit modes', () => {
    expect(() =>
      normalizePlannedPaymentCommandInput({ ...input, fxMode: 'automatic' }, []),
    ).toThrow(/From account currency/);
  });

  it('preserves explicit fixed settings when an older caller omits the new fields', () => {
    expect(
      normalizePlannedPaymentCommandInput(input, [source, destination], {
        fxMode: 'fixed',
        destinationAmount: 90,
      }),
    ).toMatchObject({ fxMode: 'fixed', destinationAmount: 90, currencyCode: 'USD' });
  });

  it('does not inherit a missing fixed amount when switching modes', () => {
    expect(() =>
      normalizePlannedPaymentCommandInput({ ...input, fxMode: 'fixed' }, [source, destination], {
        fxMode: 'automatic',
      }),
    ).toThrow(/positive destination amount/);
  });
});
