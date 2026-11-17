/**
 * The one place that decides what a sign means for display.
 *
 * Layering:
 * 1. `BalanceEffects.balanceSign` (domain) is the only rule for which way a
 *    posting moves an account's balance. Nothing else re-derives it.
 * 2. This module turns that rule into the display intents below. Every surface
 *    that signs an amount calls one of these functions. None writes its own
 *    `'+'`/`'-'` literal or its own debit/credit mapping.
 * 3. `SURFACE_RULES` names the intent each surface uses. It is documentation,
 *    and `__tests__/signLiterals.test.ts` keeps literal sign prefixes out of
 *    the rest of the codebase.
 *
 * Intents:
 * - FLOW: economic flow of a journal. Income +, spending −, refunds +.
 *   Balance-sheet-only journals (transfers, debt payments) are unsigned.
 * - LEG: one account's own view. A leg is + when it leaves the user better off:
 *   an asset or income balance going up, an expense going down (a refund), or
 *   a liability going down (a payment). Spending and new debt are −. Equity
 *   follows its balance.
 * - OBLIGATION: planned and upcoming money, by the direction of the obligation
 *   (`obligationDirection`).
 * - BANK_ENTRY: an SMS entry. `credit` is money in, so it is +.
 * - DELTA: a numeric change to a stored value. The sign follows the number.
 * - UNSIGNED: magnitudes only.
 *
 * Colours, by what the colour means:
 * - Signed amounts: income for +, expense for −, neutral for zero. Use
 *   `signColorKey`. Never success or error, which are status colours.
 * - Status: error or warning for a state, such as a shortfall, an overdue
 *   bill, or an over-budget category. This is not the sign of an amount.
 * - Category: asset, liability, equity for account types, such as net worth
 *   or an account's type colour.
 * - Type: the semantic colour of a journal type, for badges and icons.
 * - Neutral: text and secondary for unsigned magnitudes.
 */
import { AccountType, JournalDisplayType, SemanticType, TransactionType } from '@/src/types/enums';
import { balanceSign, type BalanceSign } from '@/src/domain/accounting/BalanceEffects';

export type FlowSign = -1 | 0 | 1;

export const ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.EQUITY,
  AccountType.INCOME,
  AccountType.EXPENSE,
];

const { ASSET, LIABILITY, EQUITY, INCOME, EXPENSE } = AccountType;

type Matrix5<T> = Record<AccountType, Record<AccountType, T>>;

/** Account types are free strings on read models. Unknown types have no sign. */
export function knownAccountType(value: string | undefined | null): AccountType | undefined {
  return value && (ACCOUNT_TYPES as readonly string[]).includes(value)
    ? (value as AccountType)
    : undefined;
}

/**
 * The debit or credit a SOURCE or DESTINATION leg posts. Enrichment derives the
 * role from the same line type, so this is the only mapping.
 */
export function transactionTypeForRole(
  role: 'SOURCE' | 'DESTINATION' | 'NEUTRAL' | string | undefined,
): TransactionType | undefined {
  if (role === 'SOURCE') return TransactionType.CREDIT;
  if (role === 'DESTINATION') return TransactionType.DEBIT;
  return undefined;
}

/** The transaction type that increases an account's balance, from `balanceSign`. */
export function balanceIncreaseTransaction(accountType: AccountType): TransactionType {
  return balanceSign(accountType, TransactionType.DEBIT) === 1
    ? TransactionType.DEBIT
    : TransactionType.CREDIT;
}

function flip(sign: BalanceSign): FlowSign {
  return sign === 0 ? 0 : sign === 1 ? -1 : 1;
}

/**
 * LEG sign of one posting. This is `balanceSign`, except for the two types
 * whose balance growing leaves the user worse off: an expense increase is
 * spending and a liability increase is new debt, so both flip.
 */
export function legSign(accountType: string, transactionType: TransactionType): FlowSign {
  const type = knownAccountType(accountType);
  if (!type) return 0;
  const sign = balanceSign(type, transactionType);
  return type === EXPENSE || type === LIABILITY ? flip(sign) : sign;
}

export interface FlowLine {
  accountType: string;
  transactionType: TransactionType;
  /** Amount in the journal currency. */
  amount: number;
}

/**
 * FLOW sign of a journal: the net of its income and expense legs. Balance-sheet
 * legs are ignored, so a transfer is 0.
 */
export function journalFlowSign(lines: readonly FlowLine[]): FlowSign {
  let net = 0;
  for (const line of lines) {
    const type = knownAccountType(line.accountType);
    if (type !== INCOME && type !== EXPENSE) continue;
    net += legSign(type, line.transactionType) * line.amount;
  }
  if (Math.abs(net) < 1e-9) return 0;
  return net > 0 ? 1 : -1;
}

/** FLOW sign of a two-leg journal with equal amounts. */
export function pairFlowSign(creditType: string, debitType: string): FlowSign {
  return journalFlowSign([
    { accountType: creditType, transactionType: TransactionType.CREDIT, amount: 1 },
    { accountType: debitType, transactionType: TransactionType.DEBIT, amount: 1 },
  ]);
}

/**
 * Semantic type of a two-leg journal, `[creditAccount][debitAccount]`. It drives
 * the label, badge, and type colour.
 */
export const SEMANTIC_MATRIX: Matrix5<SemanticType> = {
  [ASSET]: {
    [ASSET]: SemanticType.TRANSFER,
    [LIABILITY]: SemanticType.DEBT_PAYMENT,
    [EQUITY]: SemanticType.OWNER_WITHDRAWAL,
    [INCOME]: SemanticType.INCOME_REVERSAL,
    [EXPENSE]: SemanticType.PURCHASE,
  },
  [LIABILITY]: {
    [ASSET]: SemanticType.BORROWING,
    [LIABILITY]: SemanticType.LIABILITY_TRANSFER,
    [EQUITY]: SemanticType.DEBT_CONVERSION,
    [INCOME]: SemanticType.LIABILITY_ADJUSTMENT,
    [EXPENSE]: SemanticType.PURCHASE,
  },
  [EQUITY]: {
    [ASSET]: SemanticType.BALANCE_ADJUSTMENT,
    [LIABILITY]: SemanticType.LIABILITY_FUNDING,
    [EQUITY]: SemanticType.EQUITY_TRANSFER,
    [INCOME]: SemanticType.EQUITY_INCOME_ADJUSTMENT,
    [EXPENSE]: SemanticType.OWNER_SPENDING,
  },
  [INCOME]: {
    [ASSET]: SemanticType.INCOME_RECEIVED,
    [LIABILITY]: SemanticType.DEBT_PAYDOWN,
    [EQUITY]: SemanticType.SAVINGS_ALLOCATION,
    [INCOME]: SemanticType.INCOME_RECLASSIFICATION,
    [EXPENSE]: SemanticType.TAX_OR_FEE,
  },
  [EXPENSE]: {
    [ASSET]: SemanticType.REFUND,
    [LIABILITY]: SemanticType.CREDIT_REFUND,
    [EQUITY]: SemanticType.EXPENSE_CAPITALIZATION,
    [INCOME]: SemanticType.EXPENSE_REVERSAL,
    [EXPENSE]: SemanticType.EXPENSE_RECLASSIFICATION,
  },
};

export type ObligationDirection = 'inflow' | 'outflow' | 'transfer' | 'unknown';

/** Direction of a planned posting, from its SOURCE and DESTINATION account types. */
export function obligationDirection(
  fromType: string | undefined,
  toType: string | undefined,
): ObligationDirection {
  const from = knownAccountType(fromType);
  const to = knownAccountType(toType);
  if (!from || !to) return 'unknown';
  const isBalanceSheet = (type: AccountType) => type === ASSET || type === LIABILITY;
  const isIncomeStatement = (type: AccountType) => type === INCOME || type === EXPENSE;
  if (isBalanceSheet(from) && to === EXPENSE) return 'outflow';
  if (isIncomeStatement(from) && isBalanceSheet(to)) return 'inflow';
  if (from === to && isBalanceSheet(from)) return 'transfer';
  if (from === ASSET && to === LIABILITY) return 'outflow';
  if (from === LIABILITY && to === ASSET) return 'inflow';
  return 'unknown';
}

/** OBLIGATION sign of a direction: inflow +, outflow −, transfers and unknown 0. */
export function directionSign(direction: ObligationDirection): FlowSign {
  if (direction === 'inflow') return 1;
  if (direction === 'outflow') return -1;
  return 0;
}

export function obligationSign(fromType: string | undefined, toType: string | undefined): FlowSign {
  return directionSign(obligationDirection(fromType, toType));
}

/** BANK_ENTRY sign of an SMS direction. Unknown directions carry no sign. */
export function bankEntrySign(direction: string | null | undefined): FlowSign {
  if (direction === 'credit') return 1;
  if (direction === 'debit') return -1;
  return 0;
}

/** Prefix for a signed amount. Every surface uses this, so there is one minus character. */
export function signPrefix(sign: FlowSign): '+ ' | '− ' | '' {
  if (sign > 0) return '+ ';
  if (sign < 0) return '− ';
  return '';
}

/** Colour key for a signed amount. Zero stays neutral. */
export function signColorKey(sign: FlowSign): 'income' | 'expense' | 'text' {
  if (sign > 0) return 'income';
  if (sign < 0) return 'expense';
  return 'text';
}

/** Icon for a FLOW row. Balance-sheet-only rows use the display type. */
export function flowIconKey(
  sign: FlowSign,
  displayType: JournalDisplayType,
): 'up' | 'down' | 'swap' | 'document' {
  if (sign > 0) return 'up';
  if (sign < 0) return 'down';
  return displayType === JournalDisplayType.TRANSFER ? 'swap' : 'document';
}

/**
 * Status states and the colour each one shows. A status colour names a state,
 * such as a shortfall or an overdue bill. It is not the sign of an amount, so
 * amounts never pick success or error themselves.
 */
export const STATUS_TONE = {
  shortfall: 'error',
  overdrawn: 'error',
  overBudget: 'error',
  overdue: 'error',
  unfavorable: 'error',
  favorable: 'success',
  dueSoon: 'warning',
  unvalued: 'warning',
} as const;

export type StatusState = keyof typeof STATUS_TONE;
export type StatusColor = (typeof STATUS_TONE)[StatusState];

export function statusTone(state: StatusState): StatusColor {
  return STATUS_TONE[state];
}

export type PresentationIntent =
  'FLOW' | 'LEG' | 'OBLIGATION' | 'BANK_ENTRY' | 'DELTA' | 'UNSIGNED';

export interface SurfaceRule {
  intent: PresentationIntent;
  /** Where the sign comes from, in one line. */
  source: string;
}

/**
 * Every surface that shows a signed or unsigned amount, with its intent. A new
 * surface gets a row here, and the sign-literal test keeps it off raw literals.
 */
export const SURFACE_RULES = {
  'journal.row': { intent: 'FLOW', source: 'journalFlowSign of the journal legs' },
  'journal.dayTotal': { intent: 'FLOW', source: 'journal sign × journal total, per day' },
  'journal.details': { intent: 'FLOW', source: 'journalFlowSign of the journal legs' },
  'reports.netFlow': { intent: 'FLOW', source: 'income minus expense balance deltas' },
  'reports.v2.metric': { intent: 'DELTA', source: 'change against the prior period' },
  'account.row': { intent: 'LEG', source: 'legSign of the viewed leg' },
  'account.dayTotal': { intent: 'LEG', source: 'legSign × viewed leg amount, per day' },
  'account.hero': { intent: 'LEG', source: 'net balance change × balance increase leg sign' },
  'account.comparison': { intent: 'LEG', source: 'same as account.hero, for the previous period' },
  'account.activityChart': { intent: 'LEG', source: 'balance change × balance increase leg sign' },
  'dashboard.upcoming': { intent: 'OBLIGATION', source: 'obligationSign of SOURCE → DESTINATION' },
  'commitments.plannedCard': {
    intent: 'OBLIGATION',
    source: 'obligationDirection of the planned payment',
  },
  'safeToSpend.ledger': { intent: 'OBLIGATION', source: 'planned inflow and outflow lists' },
  'safeToSpend.shortfall': { intent: 'OBLIGATION', source: 'shortfall below zero' },
  'setup.cashClarity': { intent: 'OBLIGATION', source: 'projected INFLOW and OUTFLOW events' },
  'inbox.item': { intent: 'BANK_ENTRY', source: 'SMS direction' },
  'inbox.duplicateCandidate': { intent: 'BANK_ENTRY', source: 'SMS direction' },
  'inbox.reparse': { intent: 'BANK_ENTRY', source: 'parsed SMS direction' },
  'audit.diff': { intent: 'DELTA', source: 'numeric change of the field' },
  'export.csv': { intent: 'UNSIGNED', source: 'magnitude plus Transaction Type column' },
  'share.text': { intent: 'UNSIGNED', source: 'magnitude; type shown as emoji and label' },
  'budget.usage': { intent: 'UNSIGNED', source: 'magnitude against budget' },
} as const satisfies Record<string, SurfaceRule>;

export type PresentationSurface = keyof typeof SURFACE_RULES;
