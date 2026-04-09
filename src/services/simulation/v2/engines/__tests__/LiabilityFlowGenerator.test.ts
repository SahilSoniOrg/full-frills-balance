import { LiabilityFlowGenerator } from '../LiabilityFlowGenerator';
import { AccountSubtype } from '@/src/data/models/Account';
import dayjs from 'dayjs';

// Minimal mock for Account
const mockAcc = (id: string, subtype: AccountSubtype, name: string) =>
  ({
    id,
    accountSubtype: subtype,
    name,
  }) as any;

describe('LiabilityFlowGenerator - Dynamic Cycles', () => {
  const startOfToday = dayjs('2026-04-01T00:00:00Z');
  const simulationDays = 60;

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
        90, // Increased to 90 to capture June 15th
        spendingFlows,
      );

      // April 6 spending is after April 1 statement, so it goes to May 1st statement -> May 15th due.
      // May 6 spending is after May 1 statement, so it goes to June 1st statement -> June 15th due.

      expect(obligations).toHaveLength(2);
      expect(obligations[0]).toMatchObject({
        amount: 100,
        dueDayOffset: 44, // 2026-05-15
        label: 'Bill 2: Visa',
      });
      expect(obligations[1]).toMatchObject({
        amount: 150,
        dueDayOffset: 75, // 2026-06-15
        label: 'Bill 3: Visa',
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
      );

      expect(obligations).toHaveLength(2);
      expect(obligations[0].amount).toBe(500);
      expect(obligations[1].amount).toBe(100);
    });

    it('uses 1/24th fallback if emiAmount is missing to avoid a cliff', () => {
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
      );

      // 24000 / 24 = 1000 per month
      expect(obligations).toHaveLength(2);
      expect(obligations[0].amount).toBe(1000);
      expect(obligations[1].amount).toBe(1000);
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
      );

      expect(obligations[0].amount).toBe(100.01);
    });
  });
});
