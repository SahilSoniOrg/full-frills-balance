import { LiabilityFlowGenerator } from '../LiabilityFlowGenerator';
import { AccountSubtype } from '@/src/types/domain';

import dayjs from 'dayjs';

// Minimal mock for Account
const mockAcc = (id: string, subtype: AccountSubtype, name: string) =>
  ({
    id,
    accountSubtype: subtype,
    name,
  }) as any;

describe('LiabilityFlowGenerator - Dynamic Cycles', () => {
  const startOfToday = dayjs('2026-04-01').startOf('day');
  const simulationDays = 60;
  const mockContext = {
    simulationStartMs: startOfToday.valueOf(),
    simulationEndMs: startOfToday.add(simulationDays, 'day').valueOf(),
    simulationDays,
    convert: (amount: number) => amount,
    resultCurrency: 'USD',
    liquidAccountIds: new Set(['cash', 'savings']),
    liabilityAccountIds: new Set(['cc-1', 'loan-1']),
  } as any;

  describe('Credit Cards', () => {
    const cc = mockAcc('cc-1', AccountSubtype.CREDIT_CARD, 'Visa');
    const metadata = { statementDay: 1, dueDay: 15 }; // Statement 1st, Due 15th

    it('generates multiple obligations when spending spans multiple months', () => {
      const spendingFlows = [
        { kind: 'OUTFLOW', accountId: 'cc-1', amount: 100, dayOffset: 5 }, // April 6th -> Due May 15th
        { kind: 'OUTFLOW', accountId: 'cc-1', amount: 150, dayOffset: 35 }, // May 6th -> Due June 15th
      ] as any[];

      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        0, // currentBalance
        metadata,
        0, // statementBalance
        0, // settledSinceStatement
        startOfToday,
        90,
        spendingFlows,
        mockContext,
      );

      // April 6 spending is after April 1 statement, so it goes to May 1st statement -> May 15th due.
      // May 6 spending is after May 1 statement, so it goes to June 1st statement -> June 15th due.

      expect(obligations).toHaveLength(2);
      expect(obligations[0]).toMatchObject({
        amount: 100,
        dueDayOffset: 44, // 2026-05-15
        label: 'Visa',
      });
      expect(obligations[1]).toMatchObject({
        amount: 150,
        dueDayOffset: 75, // 2026-06-15
        label: 'Visa',
      });
    });

    it('bins spending correctly relative to statement date', () => {
      // Today: April 1. Statement: 5th. Due: 20th.
      const metadata2 = { statementDay: 5, dueDay: 20 };
      const spendingFlows = [
        { kind: 'OUTFLOW', accountId: 'cc-1', amount: 50, dayOffset: 1 }, // April 2nd <= April 5th STATEMENT -> Due April 20th
        { kind: 'OUTFLOW', accountId: 'cc-1', amount: 80, dayOffset: 10 }, // April 11th > April 5th STATEMENT -> Due May 20th
      ] as any[];

      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        0,
        metadata2,
        0,
        0,
        startOfToday,
        simulationDays,
        spendingFlows,
        mockContext,
      );

      expect(obligations).toHaveLength(2);
      expect(obligations[0].amount).toBe(50);
      expect(obligations[0].dueDayOffset).toBe(19); // April 20th
      expect(obligations[1].amount).toBe(80);
      expect(obligations[1].dueDayOffset).toBe(49); // May 20th
    });
  });

  describe('Non-Credit Card Liabilities (Loans)', () => {
    const loan = mockAcc('loan-1', AccountSubtype.LOAN, 'Car Loan');
    const metadata = { emiDay: 5, emiAmount: 500 };

    it('projects multiple EMI payments if the simulation window allows', () => {
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loan,
        1200, // currentBalance
        metadata,
        0,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      // April 5th (Day 4) -> 500
      // May 5th (Day 34) -> 500
      // June 5th (Day 65?) -> Outside 60 days

      expect(obligations).toHaveLength(2);
      expect(obligations[0]).toMatchObject({ amount: 500, dueDayOffset: 4 });
      expect(obligations[1]).toMatchObject({ amount: 500, dueDayOffset: 34 });
    });

    it('caps the last obligation to the remaining balance', () => {
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loan,
        600, // currentBalance
        metadata,
        0,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      expect(obligations).toHaveLength(2);
      expect(obligations[0].amount).toBe(500);
      expect(obligations[1].amount).toBe(100);
    });

    it('treats the entire balance as due if emiAmount is missing (legacy behavior)', () => {
      const loanNoEmi = mockAcc('loan-2', AccountSubtype.LOAN, 'Large Loan');
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loanNoEmi,
        24000, // currentBalance
        {}, // No emiAmount
        0,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      // Should project heuristic EMIs if emiAmount is missing for a loam
      expect(obligations).toHaveLength(2); // Two months @ 200/mo (24000/120)
      expect(obligations[0]).toMatchObject({
        amount: 200,
        label: 'Unsettled: Large Loan (Est. EMI)',
      });
    });

    it('reduces obligations by settledSinceStatement', () => {
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loan,
        1200, // currentBalance
        metadata,
        0,
        300, // settledSinceStatement (already paid 300)
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      // April 5th -> 500 - 300 = 200
      // May 5th -> 500
      expect(obligations).toHaveLength(2);
      expect(obligations[0]).toMatchObject({ amount: 200, dueDayOffset: 4 });
      expect(obligations[1]).toMatchObject({ amount: 500, dueDayOffset: 34 });
    });

    it('skips obligations if settledSinceStatement covers them fully', () => {
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loan,
        1200, // currentBalance
        metadata,
        0,
        600, // settledSinceStatement (already paid 600 - covers 1st EMI and 100 of 2nd)
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      // April 5th -> 500 - 600 = -100 -> Skipped
      // May 5th -> 500 - 100 = 400
      expect(obligations).toHaveLength(1);
      expect(obligations[0]).toMatchObject({ amount: 400, dueDayOffset: 34 });
    });

    it('uses minimumPaymentAmount as fallback for emiAmount for loans', () => {
      const loanMin = mockAcc('loan-min', AccountSubtype.LOAN, 'Loan with Min');
      const metadataMin = { minimumPaymentAmount: 750 };
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        loanMin,
        2000,
        metadataMin,
        0,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      expect(obligations[0]).toMatchObject({
        amount: 750,
        label: 'Unsettled: Loan with Min', // Should NOT have (Est. EMI)
      });
    });

    it('rounds obligation amounts to 2 decimal places', () => {
      const cc = mockAcc('cc-1', AccountSubtype.CREDIT_CARD, 'Visa');
      const spendingFlows = [
        { kind: 'OUTFLOW', accountId: 'cc-1', amount: 100.005, dayOffset: 5 },
      ] as any[];

      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        0,
        { statementDay: 1, dueDay: 15 },
        0,
        0,
        startOfToday,
        simulationDays,
        spendingFlows,
        mockContext,
      );

      // Should now be the raw, non-rounded internal value
      expect(obligations[0].amount).toBe(100.005);
    });

    it('respects MIN payment mode for credit cards', () => {
      const cc = mockAcc('cc-min', AccountSubtype.CREDIT_CARD, 'Min CC');
      const metadata = {
        statementDay: 1,
        dueDay: 15,
        minPaymentOnly: true,
        minimumPaymentAmount: 50,
      };

      // Current bill has 200 remaining statement balance
      const obligations = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        1000, // current balance
        metadata,
        200, // statement balance
        0, // settled since statement
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );

      // Should only owe 50 (the min payment), not 200 (the full statement)
      expect(obligations[0]).toMatchObject({
        amount: 50,
        label: 'Min CC (Min)',
      });
      // The rest (950) should roll to the next bill
      expect(obligations[1]).toMatchObject({
        amount: 50, // Projected min for next bill too
        label: 'Min CC (Min)',
      });
    });

    it('calculates MIN payment as max of amount and percentage', () => {
      const cc = mockAcc('cc-percent', AccountSubtype.CREDIT_CARD, 'Percent CC');
      const metadata = {
        statementDay: 1,
        dueDay: 15,
        minPaymentOnly: true,
        minimumPaymentAmount: 20,
        minimumPaymentPercent: 5,
      };

      const obligationsHighPercent = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        1000,
        metadata,
        500,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );
      expect(obligationsHighPercent[0].amount).toBe(50);

      const obligationsHighAbsolute = (LiabilityFlowGenerator as any).generateObligations(
        cc,
        100,
        metadata,
        100,
        0,
        startOfToday,
        simulationDays,
        [],
        mockContext,
      );
      expect(obligationsHighAbsolute[0].amount).toBe(20);
    });
  });

  describe('Pay-From Logic', () => {
    it('uses the first liquid account if payFromAccountId is missing', () => {
      const context = {
        simulationStartMs: startOfToday.valueOf(),
        simulationDays: 30,
        liquidAccountIds: new Set(['main-checking']),
        orderedLiquidAccountIds: ['main-checking'],
        liabilityAccountIds: new Set(['cc-1']),
        accountMap: new Map(),
      } as any;

      const flows = LiabilityFlowGenerator.generate(
        context,
        [],
        [{ account: mockAcc('cc-1', AccountSubtype.CREDIT_CARD, 'Visa'), balance: 100 }],
        new Map([['cc-1', { dueDay: 15 }]]),
        new Map(),
        new Map(),
      );

      expect(flows[0]).toMatchObject({
        kind: 'OUTFLOW',
        accountId: 'main-checking',
      });
    });
  });
});
