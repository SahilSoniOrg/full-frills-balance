import { DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type {
  StarterAccountInput,
  StarterCategoryInput,
  WorkplaceSetupOutput,
} from '@/src/features/setup';
import {
  ACCOUNT_KIND_META,
  budgetLookupName,
  incomeSourceName,
  paymentCategoryName,
  type CashClarityDraft,
  type CommitmentKind,
} from './draft';

const COMMITMENT_CATEGORY: Record<
  CommitmentKind,
  { name: string; icon: StarterCategoryInput['icon'] }
> = {
  rent: { name: 'Rent', icon: Icon.Home },
  subscription: { name: 'Bills', icon: Icon.Document },
  loan: { name: 'Bills', icon: Icon.Receipt },
  utilities: { name: 'Bills', icon: Icon.Document },
};

function starterFromDefault(name: string): StarterCategoryInput | undefined {
  const preset = DEFAULT_CATEGORIES.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!preset) return undefined;
  return {
    name: preset.name,
    type: preset.type === 'INCOME' ? AccountType.INCOME : AccountType.EXPENSE,
    icon: preset.icon,
  };
}

export function draftAccountId(workplaceId: WorkplaceId, draftAccountId: string): AccountId {
  return `${workplaceId}:onboarding-account:${draftAccountId}` as AccountId;
}

export function starterCategoryId(workplaceId: WorkplaceId, name: string): AccountId {
  return `${workplaceId}:onboarding-category:${name.trim().toLowerCase()}` as AccountId;
}

export function mapDraftToWorkplaceOutput(draft: CashClarityDraft): WorkplaceSetupOutput {
  const accounts: StarterAccountInput[] = draft.accounts.map(account => {
    const meta = ACCOUNT_KIND_META[account.kind];
    return {
      id: draftAccountId(draft.operationId, account.id),
      name: account.name || meta.name,
      type: meta.type,
      icon: meta.icon,
    };
  });

  const categories = new Map<string, StarterCategoryInput>();
  const add = (item: StarterCategoryInput | undefined) => {
    if (!item) return;
    categories.set(item.name.toLowerCase(), {
      ...item,
      id: item.id ?? starterCategoryId(draft.operationId, item.name),
    });
  };

  add(starterFromDefault('Groceries'));
  add(starterFromDefault('Food & Drink'));
  add(starterFromDefault('Salary'));

  if (draft.income.kind === 'recurring') {
    for (const item of draft.income.items) {
      if (item.source === 'salary') continue;
      add({
        name: incomeSourceName(item.source),
        type: AccountType.INCOME,
        icon: Icon.TrendingUp,
      });
    }
  }

  if (draft.commitment.kind === 'payment') {
    for (const item of draft.commitment.items) {
      const mapped = COMMITMENT_CATEGORY[item.type];
      add(
        starterFromDefault(paymentCategoryName(item.type)) ?? {
          name: paymentCategoryName(item.type),
          type: AccountType.EXPENSE,
          icon: mapped.icon,
        },
      );
    }
  }

  if (draft.budget.kind === 'set') {
    for (const item of draft.budget.items) {
      add(
        starterFromDefault(budgetLookupName(item)) ?? {
          name: budgetLookupName(item),
          type: AccountType.EXPENSE,
          icon: Icon.ShoppingCart,
        },
      );
    }
  }

  const name = draft.workplaceName.trim() || 'Personal';
  return {
    name: {
      value: name,
      source: name === 'Personal' ? 'defaulted' : 'user_entered',
    },
    icon: {
      value: draft.workplaceIcon,
      source: draft.workplaceIcon === Icon.Home ? 'defaulted' : 'user_entered',
    },
    baseCurrency: { value: draft.currency, source: 'user_entered' },
    selectedAccounts: accounts,
    selectedCategories: [...categories.values()],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  };
}
