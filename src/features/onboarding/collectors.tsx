import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { CollectStep } from './conversationUi';
import {
  ACCOUNT_KIND_META,
  cadenceFromIncome,
  hasPlannedCardPayment,
  hasSpendableAccount,
  incomeItemName,
  incomeRecurrence,
  incomeSourceName,
  isMoneyReady,
  newDraftId,
  nextDateOnDayOfMonth,
  paymentItemName,
  paymentName,
  uniqueName,
  type AccountKind,
  type BudgetItem,
  type CashClarityDraft,
  type CommitmentKind,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';
import { confirmBuffer, confirmIncome, confirmMoney, confirmPayments } from './spokenConfirm';

const ACCOUNT_CHIPS = DEFAULT_ACCOUNTS.filter(item =>
  ['bank', 'cash', 'savings', 'credit_card'].includes(item.id),
).map(item => ({
  id: item.id === 'credit_card' ? 'card' : item.id,
  label: item.id === 'credit_card' ? copy.typeCard : item.name,
  icon: item.icon,
}));

const INCOME_CHIPS: { id: RecurringIncome['source']; label: string; icon: IconName }[] = [
  { id: 'salary', label: copy.sourceSalary, icon: Icon.TrendingUp },
  { id: 'family', label: copy.sourceFamily, icon: Icon.Heart },
  { id: 'retirement', label: copy.sourceRetirement, icon: Icon.Safe },
  { id: 'freelance', label: copy.sourceFreelance, icon: Icon.Briefcase },
  { id: 'other', label: copy.sourceOther, icon: Icon.Tag },
];

const PAYMENT_CHIPS: { id: CommitmentKind; label: string; icon: IconName }[] = [
  { id: 'rent', label: copy.rent, icon: Icon.Home },
  { id: 'subscription', label: copy.subscription, icon: Icon.Repeat },
  { id: 'loan', label: copy.loan, icon: Icon.Receipt },
  { id: 'utilities', label: copy.utilities, icon: Icon.Zap },
];

const BUDGET_CHIPS = [
  { id: 'Food', label: 'Food', icon: Icon.ShoppingCart },
  ...DEFAULT_CATEGORIES.filter(
    item => item.type === 'EXPENSE' && item.name !== 'Groceries' && item.name !== 'Food & Drink',
  ).map(item => ({ id: item.name, label: item.name, icon: item.icon })),
];

const INCOME_ICONS = Object.fromEntries(INCOME_CHIPS.map(chip => [chip.id, chip.icon])) as Record<
  RecurringIncome['source'],
  IconName
>;
const PAYMENT_ICONS = Object.fromEntries(PAYMENT_CHIPS.map(chip => [chip.id, chip.icon])) as Record<
  CommitmentKind,
  IconName
>;
const INCOME_INTERVALS = [
  { id: 'MONTHLY' as const, label: copy.monthly },
  { id: 'BIWEEKLY' as const, label: copy.everyTwoWeeks },
  { id: 'WEEKLY' as const, label: copy.weekly },
];
const BUDGET_ICONS = Object.fromEntries(BUDGET_CHIPS.map(chip => [chip.id, chip.icon]));

function accountLabel(kind: AccountKind): string {
  return kind === 'card' ? copy.typeCard : ACCOUNT_KIND_META[kind].name;
}

function renameNamed<T extends { id: string; name: string }>(
  items: readonly T[],
  id: string,
  title: string,
  fallback: (item: T) => string,
): T[] {
  return items.map(item => {
    if (item.id !== id) return item;
    const others = items.filter(entry => entry.id !== id).map(entry => entry.name);
    return { ...item, name: uniqueName(title.trim() || fallback(item), others) };
  });
}

function hasAmount(value: number): boolean {
  return value > 0;
}

function amountsFilled(items: readonly { amount: number }[]): boolean {
  return items.length > 0 && items.every(item => hasAmount(item.amount));
}

export function MoneyScene({
  currency,
  accounts,
  onAccountsChange,
  onContinue,
  onSkip,
  onBack,
  onNeedAccount,
}: {
  readonly currency: string;
  readonly accounts: readonly DraftAccount[];
  readonly onAccountsChange: (accounts: readonly DraftAccount[]) => void;
  readonly onContinue: (heard: string) => void;
  readonly onSkip: () => void;
  readonly onBack: () => void;
  readonly onNeedAccount: () => void;
}) {
  const savingsChoice = [
    { id: 'spendable', label: copy.savingsSpendable },
    { id: 'protected', label: copy.savingsProtected },
  ];

  return (
    <CollectStep
      title={copy.moneyQuestion}
      subtitle={copy.moneyHint}
      continueLabel={copy.continueToNext}
      continueDisabled={!isMoneyReady(accounts)}
      onContinue={() => {
        if (hasPlannedCardPayment(accounts) && !hasSpendableAccount(accounts)) {
          onNeedAccount();
          return;
        }
        onContinue(confirmMoney(accounts, currency));
      }}
      onSkip={accounts.length === 0 ? onSkip : undefined}
      onBack={onBack}
      chipLabel={copy.tapTypeToAdd}
      chips={ACCOUNT_CHIPS}
      onAddChip={id => {
        const kind = id as AccountKind;
        onAccountsChange([
          ...accounts,
          {
            id: newDraftId(kind),
            kind,
            name: uniqueName(
              accountLabel(kind),
              accounts.map(account => account.name),
            ),
            balance: 0,
            ...(kind === 'card'
              ? { cardPaymentDate: nextDateOnDayOfMonth(1).startOf('day').valueOf() }
              : {}),
          },
        ]);
      }}
      currency={currency}
      items={accounts.map(account => ({
        id: account.id,
        title: account.name,
        amount: account.balance,
        icon: ACCOUNT_KIND_META[account.kind].icon,
        choice:
          account.kind === 'savings'
            ? {
                options: savingsChoice,
                selectedId:
                  account.spendable === true
                    ? 'spendable'
                    : account.spendable === false
                      ? 'protected'
                      : undefined,
              }
            : undefined,
        paymentPlan:
          account.kind === 'card'
            ? {
                amount: account.cardPaymentAmount ?? 0,
                date: account.cardPaymentDate ?? nextDateOnDayOfMonth(1).startOf('day').valueOf(),
                dateLabel: copy.dueShort,
              }
            : undefined,
      }))}
      onRename={(id, title) =>
        onAccountsChange(renameNamed(accounts, id, title, account => accountLabel(account.kind)))
      }
      onAmountChange={(id, amount) =>
        onAccountsChange(
          accounts.map(account => (account.id === id ? { ...account, balance: amount } : account)),
        )
      }
      onChoiceChange={(id, choiceId) =>
        onAccountsChange(
          accounts.map(account =>
            account.id === id ? { ...account, spendable: choiceId === 'spendable' } : account,
          ),
        )
      }
      onPaymentAmountChange={(id, amount) =>
        onAccountsChange(
          accounts.map(account =>
            account.id === id ? { ...account, cardPaymentAmount: amount } : account,
          ),
        )
      }
      onPaymentDateChange={(id, date) =>
        onAccountsChange(
          accounts.map(account =>
            account.id === id ? { ...account, cardPaymentDate: date } : account,
          ),
        )
      }
      onRemove={id => onAccountsChange(accounts.filter(account => account.id !== id))}
    />
  );
}

export function IncomeScene({
  currency,
  income,
  onIncomeChange,
  onContinue,
  onBack,
  hasSpendable,
  onNeedAccount,
}: {
  readonly currency: string;
  readonly income: CashClarityDraft['income'];
  readonly onIncomeChange: (income: CashClarityDraft['income']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
}) {
  const items = income.kind === 'recurring' ? income.items : [];
  const monthly = incomeRecurrence('MONTHLY');

  const finish = (nextItems: readonly RecurringIncome[]) => {
    onIncomeChange({ kind: 'recurring', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.incomeSource}
      continueDisabled={!amountsFilled(items)}
      onContinue={() => {
        if (items.length > 0 && !hasSpendable) {
          onNeedAccount();
          return;
        }
        onContinue(confirmIncome(items, currency));
      }}
      onSkip={
        items.length === 0
          ? () => {
              onIncomeChange({ kind: 'skipped' });
              onContinue(copy.confirmIncomeSkipped);
            }
          : undefined
      }
      skipLabel={copy.skipForNow}
      onBack={onBack}
      chipLabel={copy.tapTypeToAdd}
      chips={INCOME_CHIPS}
      onAddChip={id => {
        const source = id as RecurringIncome['source'];
        finish([
          ...items,
          {
            id: newDraftId('income'),
            name: uniqueName(
              incomeSourceName(source),
              items.map(item => item.name),
            ),
            source,
            amount: 0,
            interval: monthly.interval,
            intervalN: monthly.intervalN,
            nextDate: nextDateOnDayOfMonth(25).startOf('day').valueOf(),
          },
        ]);
      }}
      currency={currency}
      items={items.map(item => ({
        id: item.id,
        title: incomeItemName(item),
        amount: item.amount,
        icon: INCOME_ICONS[item.source],
        cadence: {
          intervals: INCOME_INTERVALS,
          selectedInterval: cadenceFromIncome(item),
          date: item.nextDate,
          dateLabel: copy.nextShort,
        },
      }))}
      onRename={(id, title) => finish(renameNamed(items, id, title, incomeItemName))}
      onAmountChange={(id, amount) =>
        finish(items.map(item => (item.id === id ? { ...item, amount } : item)))
      }
      onIntervalChange={(id, interval) => {
        const recurrence = incomeRecurrence(interval);
        finish(
          items.map(item =>
            item.id === id
              ? { ...item, interval: recurrence.interval, intervalN: recurrence.intervalN }
              : item,
          ),
        );
      }}
      onDateChange={(id, date) =>
        finish(items.map(item => (item.id === id ? { ...item, nextDate: date } : item)))
      }
      onRemove={id => {
        const remaining = items.filter(item => item.id !== id);
        onIncomeChange(
          remaining.length > 0 ? { kind: 'recurring', items: remaining } : { kind: 'unset' },
        );
      }}
    />
  );
}

export function ProtectScene({
  currency,
  commitment,
  onCommitmentChange,
  onContinue,
  onBack,
  hasSpendable,
  onNeedAccount,
}: {
  readonly currency: string;
  readonly commitment: CashClarityDraft['commitment'];
  readonly onCommitmentChange: (commitment: CashClarityDraft['commitment']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
}) {
  const items = commitment.kind === 'payment' ? commitment.items : [];

  const finish = (nextItems: readonly PaymentItem[]) => {
    onCommitmentChange({ kind: 'payment', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.protectQuestion}
      continueLabel={copy.protectAction}
      continueDisabled={!amountsFilled(items)}
      onContinue={() => {
        if (items.length > 0 && !hasSpendable) {
          onNeedAccount();
          return;
        }
        onContinue(confirmPayments(items, currency));
      }}
      onSkip={
        items.length === 0
          ? () => {
              onCommitmentChange({ kind: 'skipped' });
              onContinue(copy.noPaymentIncluded);
            }
          : undefined
      }
      skipLabel={copy.nothingYet}
      onBack={onBack}
      chipLabel={copy.tapTypeToAdd}
      chips={PAYMENT_CHIPS}
      onAddChip={id => {
        const type = id as CommitmentKind;
        finish([
          ...items,
          {
            id: newDraftId('pay'),
            name: uniqueName(
              paymentName(type),
              items.map(item => item.name),
            ),
            type,
            amount: 0,
            dueDate: nextDateOnDayOfMonth(1).startOf('day').valueOf(),
          },
        ]);
      }}
      currency={currency}
      items={items.map(item => ({
        id: item.id,
        title: paymentItemName(item),
        amount: item.amount,
        icon: PAYMENT_ICONS[item.type],
        cadence: {
          date: item.dueDate,
          dateLabel: copy.dueShort,
        },
      }))}
      onRename={(id, title) => finish(renameNamed(items, id, title, paymentItemName))}
      onAmountChange={(id, amount) =>
        finish(items.map(item => (item.id === id ? { ...item, amount } : item)))
      }
      onDateChange={(id, date) =>
        finish(items.map(item => (item.id === id ? { ...item, dueDate: date } : item)))
      }
      onRemove={id => {
        const remaining = items.filter(item => item.id !== id);
        onCommitmentChange(
          remaining.length > 0 ? { kind: 'payment', items: remaining } : { kind: 'unset' },
        );
      }}
    />
  );
}

export function ReserveScene({
  currency,
  budget,
  onBudgetChange,
  onContinue,
  onBack,
  hasSpendable,
  onNeedAccount,
}: {
  readonly currency: string;
  readonly budget: CashClarityDraft['budget'];
  readonly onBudgetChange: (budget: CashClarityDraft['budget']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
}) {
  const items = budget.kind === 'set' ? budget.items : [];

  const finish = (nextItems: readonly BudgetItem[]) => {
    onBudgetChange({ kind: 'set', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.reserveQuestion}
      subtitle={copy.reserveHint}
      continueDisabled={!amountsFilled(items)}
      onContinue={() => {
        if (items.length > 0 && !hasSpendable) {
          onNeedAccount();
          return;
        }
        onContinue(confirmBuffer(items, currency));
      }}
      onSkip={
        items.length === 0
          ? () => {
              onBudgetChange({ kind: 'skipped' });
              onContinue(copy.noBufferIncluded);
            }
          : undefined
      }
      onBack={onBack}
      chipLabel={copy.tapTypeToAdd}
      chips={BUDGET_CHIPS}
      onAddChip={category => {
        finish([
          ...items,
          {
            id: newDraftId('budget'),
            name: uniqueName(
              category,
              items.map(item => item.name),
            ),
            amount: 0,
            category,
          },
        ]);
      }}
      currency={currency}
      items={items.map(item => ({
        id: item.id,
        title: item.name,
        amount: item.amount,
        icon: BUDGET_ICONS[item.category ?? item.name],
      }))}
      onRename={(id, title) =>
        finish(renameNamed(items, id, title, item => item.category ?? 'Food'))
      }
      onAmountChange={(id, amount) =>
        finish(items.map(item => (item.id === id ? { ...item, amount } : item)))
      }
      onRemove={id => {
        const remaining = items.filter(item => item.id !== id);
        onBudgetChange(
          remaining.length > 0 ? { kind: 'set', items: remaining } : { kind: 'unset' },
        );
      }}
    />
  );
}
