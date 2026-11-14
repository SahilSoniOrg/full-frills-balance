import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { getLocales } from 'expo-localization';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { CollectStep } from './conversationUi';
import type { CollectedItem } from './CollectedRow';
import { amountIssueMessage, currencyPrecision, formatAmountInput, parseAmountInput } from './amountValidation';
import {
  ACCOUNT_KIND_META,
  amountInputKey,
  cardPaymentInputKey,
  cadenceFromIncome,
  incomeItemName,
  incomeRecurrence,
  incomeSourceName,
  isMoneyReady,
  isSpendableAccount,
  newDraftId,
  nextDateOnDayOfMonth,
  paymentItemName,
  paymentName,
  uniqueName,
  type AccountKind,
  type BudgetItem,
  type CashClarityDraft,
  type CashClarityEditableInput,
  type CommitmentKind,
  type DraftAccount,
  type PaymentItem,
  type RecurringIncome,
} from './draft';
import { confirmBuffer, confirmIncome, confirmMoney, confirmPayments } from './spokenConfirm';
import { committedItemName } from './validation';

export type CollectorSessionHooks = {
  /** Raw editor strings and defer metadata for the owning session. */
  readonly editableInput?: CashClarityEditableInput;
  /** Stable item key plus unmodified text; pass undefined to clear a key on row removal. */
  readonly onAmountTextChange?: (key: string, raw: string | undefined) => void;
  /** Parent session marks this collector deferred before moving to the next step. */
  readonly onDefer?: () => void;
  /** Parent session clears this collector's defer flag after valid Continue. */
  readonly onInclude?: () => void;
  readonly locale?: string;
  readonly continueLabel?: string;
  readonly validationMessage?: string | null;
  readonly recovery?: ReactNode;
  readonly footer?: ReactNode;
  readonly onValidationBlocked?: (reason: 'amount_invalid' | 'missing_spendable_account' | 'dependency_unresolved') => void;
};

function useAmountEditor(
  editableInput: CashClarityEditableInput | undefined,
  onAmountTextChange: CollectorSessionHooks['onAmountTextChange'],
  locale: string,
) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const read = (key: string, amount: number, blankZero = false) =>
    editableInput?.amountTextById[key] ??
    local[key] ??
    (blankZero && amount === 0 ? '' : formatAmountInput(amount, locale));
  const write = (key: string, raw: string | undefined) => {
    setLocal(previous => {
      if (raw === undefined) {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      return { ...previous, [key]: raw };
    });
    onAmountTextChange?.(key, raw);
  };
  return { read, write };
}

function amountIsValid(
  raw: string,
  currency: string,
  locale: string,
  positiveOnly: boolean,
  signedAllowed: boolean,
): boolean {
  return amountInputError(raw, currency, locale, positiveOnly, signedAllowed) === null;
}

function amountInputError(
  raw: string,
  currency: string,
  locale: string,
  positiveOnly: boolean,
  signedAllowed: boolean,
): string | null {
  const parsed = parseAmountInput(raw, locale, currencyPrecision(currency));
  return amountIssueMessage(parsed, positiveOnly, signedAllowed) ?? null;
}

function namedAddChips<T extends { readonly label: string }>(chips: readonly T[]): T[] {
  return chips.map(chip => ({ ...chip, label: `Add ${chip.label}` }));
}

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
    return { ...item, name: uniqueName(committedItemName(title, fallback(item)), others) };
  });
}

export function MoneyScene({
  currency,
  accounts,
  onAccountsChange,
  onContinue,
  onSkip,
  onBack,
  onNeedAccount,
  editableInput,
  onAmountTextChange,
  onDefer,
  onInclude,
  continueLabel,
  validationMessage,
  recovery,
  footer,
  onValidationBlocked,
  locale = getLocales()[0]?.languageTag ?? 'en-US',
}: {
  readonly currency: string;
  readonly accounts: readonly DraftAccount[];
  readonly onAccountsChange: (accounts: readonly DraftAccount[]) => void;
  readonly onContinue: (heard: string) => void;
  readonly onSkip: () => void;
  readonly onBack: () => void;
  readonly onNeedAccount: () => void;
} & CollectorSessionHooks) {
  const amountEditor = useAmountEditor(editableInput, onAmountTextChange, locale);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const accountAmountsValid = accounts.every(account =>
    amountIsValid(
      amountEditor.read(amountInputKey(account.id), account.balance),
      currency,
      locale,
      false,
      account.kind !== 'card',
    ),
  );
  const cardPaymentAmountsValid = accounts.every(account => {
    if (account.kind !== 'card') return true;
    const raw = amountEditor.read(cardPaymentInputKey(account.id), account.cardPaymentAmount ?? 0, true);
    return !raw.trim() || amountIsValid(raw, currency, locale, false, false);
  });
  const hasIncludedCardPayment = accounts.some(account => {
    if (account.kind !== 'card') return false;
    const raw = amountEditor.read(cardPaymentInputKey(account.id), account.cardPaymentAmount ?? 0, true);
    if (!raw.trim()) return false;
    const parsed = parseAmountInput(raw, locale, currencyPrecision(currency));
    return parsed.status === 'valid' && parsed.value > 0;
  });
  const spendableAccounts = accounts.filter(isSpendableAccount).filter(account =>
    amountIsValid(
      amountEditor.read(amountInputKey(account.id), account.balance),
      currency,
      locale,
      false,
      true,
    ),
  );
  const hasEligibleSpendable = spendableAccounts.length > 0;
  const deferred = editableInput?.deferredCollections?.accounts === true;
  const savingsChoice = [
    { id: 'spendable', label: copy.savingsSpendable },
    { id: 'protected', label: copy.savingsProtected },
  ];
  const collectedItems = accounts.map((account): CollectedItem => {
    const common = {
      id: account.id,
      title: account.name,
      amount: account.balance,
      amountText: amountEditor.read(amountInputKey(account.id), account.balance),
      amountError: validationAttempted
        ? amountInputError(
            amountEditor.read(amountInputKey(account.id), account.balance),
            currency,
            locale,
            false,
            account.kind !== 'card',
          )
        : undefined,
      amountLabel: account.kind === 'card' ? copy.cardAmountLabel : copy.currentBalance,
      icon: ACCOUNT_KIND_META[account.kind].icon,
      locale,
      onAmountTextChange: (raw: string) => amountEditor.write(amountInputKey(account.id), raw),
      onRename: (title: string) =>
        onAccountsChange(renameNamed(accounts, account.id, title, item => accountLabel(item.kind))),
      onAmountChange: (amount: number) =>
        onAccountsChange(
          accounts.map(item => (item.id === account.id ? { ...item, balance: amount } : item)),
        ),
      onRemove: () => {
        amountEditor.write(amountInputKey(account.id), undefined);
        amountEditor.write(cardPaymentInputKey(account.id), undefined);
        onAccountsChange(accounts.filter(item => item.id !== account.id));
      },
    };

    if (account.kind === 'savings') {
      return {
        ...common,
        kind: 'account',
        detail: {
          kind: 'savings',
          options: savingsChoice,
          issue:
            validationAttempted && account.spendable === undefined
              ? 'Choose whether these savings are available to spend.'
              : undefined,
          selectedId:
            account.spendable === true
              ? 'spendable'
              : account.spendable === false
                ? 'protected'
                : undefined,
          onSelect: (choiceId: string) =>
            onAccountsChange(
              accounts.map(item =>
                item.id === account.id ? { ...item, spendable: choiceId === 'spendable' } : item,
              ),
            ),
        },
      };
    }

    if (account.kind === 'card') {
      return {
        ...common,
        kind: 'account',
        detail: {
          kind: 'card',
          paymentPlan: {
            amount: account.cardPaymentAmount ?? 0,
            date: account.cardPaymentDate ?? nextDateOnDayOfMonth(1).startOf('day').valueOf(),
            dateLabel: copy.dueShort,
          },
          paymentAmountText: amountEditor.read(
            cardPaymentInputKey(account.id),
            account.cardPaymentAmount ?? 0,
            true,
          ),
          paymentAmountError: validationAttempted
            ? amountEditor.read(cardPaymentInputKey(account.id), account.cardPaymentAmount ?? 0, true).trim()
              ? amountInputError(
                  amountEditor.read(cardPaymentInputKey(account.id), account.cardPaymentAmount ?? 0, true),
                  currency,
                  locale,
                  false,
                  false,
                )
              : null
            : undefined,
          onPaymentAmountTextChange: (raw: string) =>
            amountEditor.write(cardPaymentInputKey(account.id), raw),
          onAmountChange: (amount: number | undefined) =>
            onAccountsChange(
              accounts.map(item =>
                item.id === account.id
                  ? {
                      ...item,
                      cardPaymentAmount: amount,
                      cardPaymentDate: amount === undefined
                        ? undefined
                        : item.cardPaymentDate ?? nextDateOnDayOfMonth(1).startOf('day').valueOf(),
                    }
                  : item,
              ),
            ),
          onDateChange: (date: number) =>
            onAccountsChange(
              accounts.map(item =>
                item.id === account.id ? { ...item, cardPaymentDate: date } : item,
              ),
            ),
        },
      };
    }

    return { ...common, kind: 'account', detail: { kind: 'plain' } };
  });

  return (
    <CollectStep
      title={copy.moneyQuestion}
      subtitle={deferred ? `Not included yet. ${copy.moneyHint}` : copy.moneyHint}
      continueLabel={continueLabel ?? copy.continueToNext}
      continueDisabled={accounts.length === 0}
      onContinue={() => {
        setValidationAttempted(true);
        if (!isMoneyReady(accounts) || !accountAmountsValid || !cardPaymentAmountsValid) {
          onValidationBlocked?.(isMoneyReady(accounts) ? 'amount_invalid' : 'dependency_unresolved');
          return;
        }
        if (hasIncludedCardPayment && !hasEligibleSpendable) {
          onValidationBlocked?.('missing_spendable_account');
          onNeedAccount();
          return;
        }
        onInclude?.();
        onContinue(confirmMoney(accounts, currency));
      }}
      onSkip={
        onDefer
          ? () => {
              onDefer();
              onContinue(copy.clarityNoCashYet);
            }
          : accounts.length === 0
            ? onSkip
            : undefined
      }
      skipLabel={onDefer ? copy.addLater : copy.skipMoney}
      onBack={onBack}
      validationMessage={validationMessage}
      recovery={recovery}
      footer={footer}
      chipLabel={copy.tapTypeToAdd}
      chips={namedAddChips(ACCOUNT_CHIPS)}
      onAddChip={id => {
        const kind = id as AccountKind;
        const account: DraftAccount = {
          id: newDraftId(kind),
          kind,
          name: uniqueName(
            accountLabel(kind),
            accounts.map(current => current.name),
          ),
          balance: 0,
          ...(kind === 'card'
            ? { cardPaymentDate: nextDateOnDayOfMonth(1).startOf('day').valueOf() }
            : {}),
        };
        onAccountsChange([
          ...accounts,
          account,
        ]);
        amountEditor.write(amountInputKey(account.id), '');
      }}
      currency={currency}
      items={collectedItems}
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
  editableInput,
  onAmountTextChange,
  onDefer,
  onInclude,
  continueLabel,
  validationMessage,
  recovery,
  footer,
  onValidationBlocked,
  locale = getLocales()[0]?.languageTag ?? 'en-US',
}: {
  readonly currency: string;
  readonly income: CashClarityDraft['income'];
  readonly onIncomeChange: (income: CashClarityDraft['income']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
} & CollectorSessionHooks) {
  const amountEditor = useAmountEditor(editableInput, onAmountTextChange, locale);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const items = income.kind === 'recurring' ? income.items : [];
  const monthly = incomeRecurrence('MONTHLY');
  const amountsValid = items.length > 0 && items.every(item =>
    amountIsValid(amountEditor.read(amountInputKey(item.id), item.amount), currency, locale, true, false),
  );
  const deferred = editableInput?.deferredCollections?.income === true;

  const finish = (nextItems: readonly RecurringIncome[]) => {
    onIncomeChange({ kind: 'recurring', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.incomeSource}
      continueLabel={continueLabel ?? copy.continueToPayments}
      subtitle={deferred ? 'Not included yet.' : undefined}
      continueDisabled={items.length === 0}
      onContinue={() => {
        setValidationAttempted(true);
        if (!amountsValid) {
          onValidationBlocked?.('amount_invalid');
          return;
        }
        if (items.length > 0 && !hasSpendable) {
          onValidationBlocked?.('missing_spendable_account');
          onNeedAccount();
          return;
        }
        onInclude?.();
        onContinue(confirmIncome(items, currency));
      }}
      onSkip={
        onDefer
          ? () => {
              onDefer();
              onContinue(copy.confirmIncomeSkipped);
            }
          : items.length === 0
            ? () => {
                onIncomeChange({ kind: 'skipped' });
                onContinue(copy.confirmIncomeSkipped);
              }
            : undefined
      }
      skipLabel={onDefer ? copy.addLater : copy.skipForNow}
      onBack={onBack}
      validationMessage={validationMessage}
      recovery={recovery}
      footer={footer}
      chipLabel={copy.tapTypeToAdd}
      chips={namedAddChips(INCOME_CHIPS)}
      onAddChip={id => {
        const source = id as RecurringIncome['source'];
        const item: RecurringIncome = {
          id: newDraftId('income'),
          name: uniqueName(
            incomeSourceName(source),
            items.map(current => current.name),
          ),
          source,
          amount: 0,
          interval: monthly.interval,
          intervalN: monthly.intervalN,
          nextDate: nextDateOnDayOfMonth(25).startOf('day').valueOf(),
        };
        finish([
          ...items,
          item,
        ]);
        amountEditor.write(amountInputKey(item.id), '');
      }}
      currency={currency}
      items={items.map((item): CollectedItem => ({
        kind: 'income',
        id: item.id,
        title: incomeItemName(item),
        amount: item.amount,
        amountText: amountEditor.read(amountInputKey(item.id), item.amount),
        amountError: validationAttempted
          ? amountInputError(
              amountEditor.read(amountInputKey(item.id), item.amount),
              currency,
              locale,
              true,
              false,
            )
          : undefined,
        locale,
        amountLabel: copy.incomeAmountLabel,
        icon: INCOME_ICONS[item.source],
        cadence: {
          intervals: INCOME_INTERVALS,
          selectedInterval: cadenceFromIncome(item),
          date: item.nextDate,
          dateLabel: copy.nextShort,
        },
        onRename: title => finish(renameNamed(items, item.id, title, incomeItemName)),
        onAmountChange: amount =>
          finish(items.map(current => (current.id === item.id ? { ...current, amount } : current))),
        onAmountTextChange: raw => amountEditor.write(amountInputKey(item.id), raw),
        onIntervalChange: interval => {
          const recurrence = incomeRecurrence(interval);
          finish(
            items.map(current =>
              current.id === item.id
                ? { ...current, interval: recurrence.interval, intervalN: recurrence.intervalN }
                : current,
            ),
          );
        },
        onDateChange: date =>
          finish(
            items.map(current =>
              current.id === item.id ? { ...current, nextDate: date } : current,
            ),
          ),
        onRemove: () => {
          amountEditor.write(amountInputKey(item.id), undefined);
          const remaining = items.filter(current => current.id !== item.id);
          onIncomeChange(
            remaining.length > 0 ? { kind: 'recurring', items: remaining } : { kind: 'unset' },
          );
        },
      }))}
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
  editableInput,
  onAmountTextChange,
  onDefer,
  onInclude,
  continueLabel,
  validationMessage,
  recovery,
  footer,
  onValidationBlocked,
  locale = getLocales()[0]?.languageTag ?? 'en-US',
}: {
  readonly currency: string;
  readonly commitment: CashClarityDraft['commitment'];
  readonly onCommitmentChange: (commitment: CashClarityDraft['commitment']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
} & CollectorSessionHooks) {
  const amountEditor = useAmountEditor(editableInput, onAmountTextChange, locale);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const items = commitment.kind === 'payment' ? commitment.items : [];
  const amountsValid = items.length > 0 && items.every(item =>
    amountIsValid(amountEditor.read(amountInputKey(item.id), item.amount), currency, locale, true, false),
  );
  const deferred = editableInput?.deferredCollections?.commitment === true;

  const finish = (nextItems: readonly PaymentItem[]) => {
    onCommitmentChange({ kind: 'payment', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.protectQuestion}
      subtitle={deferred ? 'Not included yet.' : undefined}
      continueLabel={continueLabel ?? copy.continueToBoundaries}
      continueDisabled={items.length === 0}
      onContinue={() => {
        setValidationAttempted(true);
        if (!amountsValid) {
          onValidationBlocked?.('amount_invalid');
          return;
        }
        if (items.length > 0 && !hasSpendable) {
          onValidationBlocked?.('missing_spendable_account');
          onNeedAccount();
          return;
        }
        onInclude?.();
        onContinue(confirmPayments(items, currency));
      }}
      onSkip={
        onDefer
          ? () => {
              onDefer();
              onContinue(copy.noPaymentIncluded);
            }
          : items.length === 0
            ? () => {
                onCommitmentChange({ kind: 'skipped' });
                onContinue(copy.noPaymentIncluded);
              }
            : undefined
      }
      skipLabel={onDefer ? copy.addLater : copy.skipPayments}
      onBack={onBack}
      validationMessage={validationMessage}
      recovery={recovery}
      footer={footer}
      chipLabel={copy.tapTypeToAdd}
      chips={namedAddChips(PAYMENT_CHIPS)}
      onAddChip={id => {
        const type = id as CommitmentKind;
        const item: PaymentItem = {
          id: newDraftId('pay'),
          name: uniqueName(
            paymentName(type),
            items.map(current => current.name),
          ),
          type,
          amount: 0,
          dueDate: nextDateOnDayOfMonth(1).startOf('day').valueOf(),
        };
        finish([
          ...items,
          item,
        ]);
        amountEditor.write(amountInputKey(item.id), '');
      }}
      currency={currency}
      items={items.map((item): CollectedItem => ({
        kind: 'payment',
        id: item.id,
        title: paymentItemName(item),
        amount: item.amount,
        amountText: amountEditor.read(amountInputKey(item.id), item.amount),
        amountError: validationAttempted
          ? amountInputError(
              amountEditor.read(amountInputKey(item.id), item.amount),
              currency,
              locale,
              true,
              false,
            )
          : undefined,
        amountLabel: copy.paymentAmountLabel,
        icon: PAYMENT_ICONS[item.type],
        locale,
        date: item.dueDate,
        dateLabel: copy.dueShort,
        onRename: title => finish(renameNamed(items, item.id, title, paymentItemName)),
        onAmountChange: amount =>
          finish(items.map(current => (current.id === item.id ? { ...current, amount } : current))),
        onAmountTextChange: raw => amountEditor.write(amountInputKey(item.id), raw),
        onDateChange: date =>
          finish(
            items.map(current =>
              current.id === item.id ? { ...current, dueDate: date } : current,
            ),
          ),
        onRemove: () => {
          amountEditor.write(amountInputKey(item.id), undefined);
          const remaining = items.filter(current => current.id !== item.id);
          onCommitmentChange(
            remaining.length > 0 ? { kind: 'payment', items: remaining } : { kind: 'unset' },
          );
        },
      }))}
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
  editableInput,
  onAmountTextChange,
  onDefer,
  onInclude,
  continueLabel,
  validationMessage,
  recovery,
  footer,
  onValidationBlocked,
  locale = getLocales()[0]?.languageTag ?? 'en-US',
}: {
  readonly currency: string;
  readonly budget: CashClarityDraft['budget'];
  readonly onBudgetChange: (budget: CashClarityDraft['budget']) => void;
  readonly onContinue: (heard: string) => void;
  readonly onBack: () => void;
  readonly hasSpendable: boolean;
  readonly onNeedAccount: () => void;
} & CollectorSessionHooks) {
  const amountEditor = useAmountEditor(editableInput, onAmountTextChange, locale);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const items = budget.kind === 'set' ? budget.items : [];
  const amountsValid = items.length > 0 && items.every(item =>
    amountIsValid(amountEditor.read(amountInputKey(item.id), item.amount), currency, locale, true, false),
  );
  const deferred = editableInput?.deferredCollections?.budget === true;

  const finish = (nextItems: readonly BudgetItem[]) => {
    onBudgetChange({ kind: 'set', items: nextItems });
  };

  return (
    <CollectStep
      title={copy.reserveQuestion}
      subtitle={deferred ? `Not included yet. ${copy.reserveHint}` : copy.reserveHint}
      continueLabel={continueLabel ?? copy.continueToClarity}
      continueDisabled={items.length === 0}
      onContinue={() => {
        setValidationAttempted(true);
        if (!amountsValid) {
          onValidationBlocked?.('amount_invalid');
          return;
        }
        if (items.length > 0 && !hasSpendable) {
          onValidationBlocked?.('missing_spendable_account');
          onNeedAccount();
          return;
        }
        onInclude?.();
        onContinue(confirmBuffer(items, currency));
      }}
      onSkip={
        onDefer
          ? () => {
              onDefer();
              onContinue(copy.noBufferIncluded);
            }
          : items.length === 0
            ? () => {
                onBudgetChange({ kind: 'skipped' });
                onContinue(copy.noBufferIncluded);
              }
            : undefined
      }
      skipLabel={onDefer ? copy.addLater : copy.skipBudgets}
      onBack={onBack}
      validationMessage={validationMessage}
      recovery={recovery}
      footer={footer}
      chipLabel={copy.tapTypeToAdd}
      chips={namedAddChips(BUDGET_CHIPS)}
      onAddChip={category => {
        const item: BudgetItem = {
          id: newDraftId('budget'),
          name: uniqueName(
            category,
            items.map(current => current.name),
          ),
          amount: 0,
          category,
        };
        finish([
          ...items,
          item,
        ]);
        amountEditor.write(amountInputKey(item.id), '');
      }}
      currency={currency}
      items={items.map((item): CollectedItem => ({
        kind: 'budget',
        id: item.id,
        title: item.name,
        amount: item.amount,
        amountText: amountEditor.read(amountInputKey(item.id), item.amount),
        amountError: validationAttempted
          ? amountInputError(
              amountEditor.read(amountInputKey(item.id), item.amount),
              currency,
              locale,
              true,
              false,
            )
          : undefined,
        amountLabel: copy.reserveAmount,
        icon: BUDGET_ICONS[item.category ?? item.name],
        locale,
        onRename: title =>
          finish(renameNamed(items, item.id, title, current => current.category ?? 'Food')),
        onAmountChange: amount =>
          finish(items.map(current => (current.id === item.id ? { ...current, amount } : current))),
        onAmountTextChange: raw => amountEditor.write(amountInputKey(item.id), raw),
        onRemove: () => {
          amountEditor.write(amountInputKey(item.id), undefined);
          const remaining = items.filter(current => current.id !== item.id);
          onBudgetChange(
            remaining.length > 0 ? { kind: 'set', items: remaining } : { kind: 'unset' },
          );
        },
      }))}
    />
  );
}
