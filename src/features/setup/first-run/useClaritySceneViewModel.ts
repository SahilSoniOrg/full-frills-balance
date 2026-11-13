import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { incomeItemName, paymentItemName, type CashClarityDraft } from './draft';
import type { CashClarityProjection, ClarityBeat } from './projectCashClarityDraft';

export type ClarityDetailGroupKey = 'cash' | 'income' | 'payments' | 'budgets';

export type ClarityDetailRow =
  | {
      readonly kind: 'label';
      readonly id: string;
      readonly label: string;
      readonly detail?: string;
    }
  | {
      readonly kind: 'figure';
      readonly id: string;
      readonly label: string;
      readonly detail: string;
      readonly amount: number;
      readonly sign?: '+' | '-';
    };

export interface ClarityDetailGroup {
  readonly key: ClarityDetailGroupKey;
  readonly stage: string;
  readonly tint: ComponentVariant;
  readonly amount: number;
  readonly sign?: '+' | '-';
  readonly rows: readonly ClarityDetailRow[];
}

export interface ClaritySceneViewModel {
  readonly hasAnyInput: boolean;
  readonly stsColor: ComponentVariant;
  readonly todayBeats: readonly ClarityBeat[];
  readonly detailGroups: readonly ClarityDetailGroup[];
}

export function useClaritySceneViewModel(
  draft: CashClarityDraft,
  projection: CashClarityProjection,
): ClaritySceneViewModel {
  return useMemo(() => {
    const income = draft.income.kind === 'recurring' ? draft.income.items : [];
    const payments = draft.commitment.kind === 'payment' ? draft.commitment.items : [];
    const budgets = draft.budget.kind === 'set' ? draft.budget.items : [];
    const hasCash =
      projection.liquidNow > 0 || draft.accounts.some(account => account.kind !== 'card');
    const detailGroups: ClarityDetailGroup[] = [];

    if (hasCash) {
      detailGroups.push({
        key: 'cash',
        stage: copy.stageNow,
        tint: 'asset',
        amount: projection.liquidNow,
        rows: [{ kind: 'label', id: 'cash', label: copy.cashYouHave }],
      });
    }

    if (income.length > 0) {
      detailGroups.push({
        key: 'income',
        stage: copy.stageNext,
        tint: 'income',
        amount: income.reduce((sum, item) => sum + item.amount, 0),
        sign: '+',
        rows: income.map((item): ClarityDetailRow => {
          const row = {
            id: item.id,
            label: incomeItemName(item),
            detail: dayjs(item.nextDate).format('D MMM'),
          };
          return income.length > 1
            ? { ...row, kind: 'figure', amount: item.amount, sign: '+' }
            : { ...row, kind: 'label' };
        }),
      });
    }

    if (payments.length > 0) {
      detailGroups.push({
        key: 'payments',
        stage: copy.stageProtect,
        tint: 'expense',
        amount: payments.reduce((sum, item) => sum + item.amount, 0),
        sign: '-',
        rows: payments.map((item): ClarityDetailRow => {
          const row = {
            id: item.id,
            label: paymentItemName(item),
            detail: dayjs(item.dueDate).format('D MMM'),
          };
          return payments.length > 1
            ? { ...row, kind: 'figure', amount: item.amount, sign: '-' }
            : { ...row, kind: 'label' };
        }),
      });
    }

    if (budgets.length > 0) {
      detailGroups.push({
        key: 'budgets',
        stage: copy.stageReserve,
        tint: 'warning',
        amount: projection.budgetReserveInWindow,
        rows: budgets.map((item): ClarityDetailRow => {
          const row = {
            id: item.id,
            label: item.category === 'Food' || item.name === 'Food' ? copy.foodBuffer : item.name,
            detail: copy.monthly,
          };
          return budgets.length > 1
            ? { ...row, kind: 'figure', amount: item.amount }
            : { ...row, kind: 'label' };
        }),
      });
    }

    return {
      hasAnyInput: detailGroups.length > 0,
      stsColor:
        projection.safeToSpend > 0 ? 'primary' : projection.safeToSpend < 0 ? 'error' : 'secondary',
      todayBeats: projection.today.filter(beat => beat.key !== 'sts'),
      detailGroups,
    };
  }, [draft, projection]);
}
