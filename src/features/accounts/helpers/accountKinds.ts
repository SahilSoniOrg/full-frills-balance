import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import {
  ACCOUNT_SUBTYPES_BY_TYPE,
  formatAccountSubtypeLabel,
  isAccountSubtype,
  isSubtypeAllowedForType,
} from '@/src/types/accountSubtype';
import { isLoanSubtype } from '@/src/utils/accountSubtypeUtils';

export interface SuggestedAccountKind {
  type: AccountType;
  subtype: AccountSubtype;
}

export interface AccountKind extends SuggestedAccountKind {
  key: string;
  label: string;
  icon: IconName;
  caption: string;
  tone: 'asset' | 'liability' | 'income' | 'expense';
}

export const ACCOUNT_KINDS: readonly AccountKind[] = [
  {
    key: 'cash',
    type: AccountType.ASSET,
    subtype: AccountSubtype.CASH,
    label: copy.kinds.cash,
    icon: Icon.Transaction,
    caption: copy.assetCaption,
    tone: 'asset',
  },
  {
    key: 'wallet',
    type: AccountType.ASSET,
    subtype: AccountSubtype.WALLET,
    label: copy.kinds.wallet,
    icon: Icon.Wallet,
    caption: copy.assetCaption,
    tone: 'asset',
  },
  {
    key: 'bank',
    type: AccountType.ASSET,
    subtype: AccountSubtype.BANK_CHECKING,
    label: copy.kinds.bank,
    icon: Icon.Bank,
    caption: copy.assetCaption,
    tone: 'asset',
  },
  {
    key: 'savings',
    type: AccountType.ASSET,
    subtype: AccountSubtype.BANK_SAVINGS,
    label: copy.kinds.savings,
    icon: Icon.Safe,
    caption: copy.assetCaption,
    tone: 'asset',
  },
  {
    key: 'credit_card',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.CREDIT_CARD,
    label: copy.kinds.creditCard,
    icon: Icon.CreditCard,
    caption: copy.liabilityCaption,
    tone: 'liability',
  },
  {
    key: 'loan',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.LOAN,
    label: copy.kinds.loan,
    icon: Icon.Bank,
    caption: copy.liabilityCaption,
    tone: 'liability',
  },
];

export const DEFAULT_ACCOUNT_KIND = ACCOUNT_KINDS[2];

const CATEGORY_ICONS: Partial<Record<AccountSubtype, IconName>> = {
  [AccountSubtype.FOOD]: Icon.Coffee,
  [AccountSubtype.HOUSING]: Icon.Home,
  [AccountSubtype.TRANSPORT]: Icon.Bus,
  [AccountSubtype.UTILITIES]: Icon.Zap,
  [AccountSubtype.HEALTHCARE]: Icon.Heart,
  [AccountSubtype.EDUCATION]: Icon.Document,
  [AccountSubtype.ENTERTAINMENT]: Icon.Film,
  [AccountSubtype.SHOPPING]: Icon.ShoppingBag,
  [AccountSubtype.SALARY]: Icon.Briefcase,
  [AccountSubtype.BUSINESS_INCOME]: Icon.Bank,
  [AccountSubtype.INTEREST_INCOME]: Icon.TrendingUp,
  [AccountSubtype.DIVIDEND_INCOME]: Icon.TrendingUp,
  [AccountSubtype.RENT_INCOME]: Icon.Home,
  [AccountSubtype.TAX]: Icon.Receipt,
  [AccountSubtype.TRANSFER]: Icon.SwapHorizontal,
};

export const CATEGORY_KINDS: readonly AccountKind[] = [
  AccountType.EXPENSE,
  AccountType.INCOME,
].flatMap(type =>
  ACCOUNT_SUBTYPES_BY_TYPE[type].map(subtype => ({
    key: `${type.toLowerCase()}_${subtype.toLowerCase()}`,
    type,
    subtype,
    label: formatAccountSubtypeLabel(subtype),
    icon: CATEGORY_ICONS[subtype] ?? (type === AccountType.INCOME ? Icon.TrendingUp : Icon.Tag),
    caption: type === AccountType.INCOME ? copy.incomeCategory : copy.expenseCategory,
    tone: type === AccountType.INCOME ? ('income' as const) : ('expense' as const),
  })),
);

export function isCarouselAccountType(type: AccountType): boolean {
  return (
    type === AccountType.ASSET ||
    type === AccountType.LIABILITY ||
    type === AccountType.INCOME ||
    type === AccountType.EXPENSE
  );
}

export function resolveAccountSubtypeParam(
  type: AccountType,
  param?: string,
): AccountSubtype | null {
  const subtype = param?.toUpperCase();
  return subtype && isAccountSubtype(subtype) && isSubtypeAllowedForType(type, subtype)
    ? subtype
    : null;
}

export function getAccountKind(type: AccountType, subtype: AccountSubtype): AccountKind | null {
  if (!isCarouselAccountType(type) || !isSubtypeAllowedForType(type, subtype)) return null;
  if (type === AccountType.INCOME || type === AccountType.EXPENSE) {
    return CATEGORY_KINDS.find(kind => kind.type === type && kind.subtype === subtype) ?? null;
  }
  const standard = ACCOUNT_KINDS.find(kind => kind.type === type && kind.subtype === subtype);
  if (standard) return standard;
  const isAsset = type === AccountType.ASSET;
  return {
    key: `${type.toLowerCase()}_${subtype.toLowerCase()}`,
    type,
    subtype,
    label: formatAccountSubtypeLabel(subtype),
    icon: isAsset ? Icon.Bank : isLoanSubtype(subtype) ? Icon.Bank : Icon.CreditCard,
    caption: isAsset ? copy.assetCaption : copy.liabilityCaption,
    tone: isAsset ? 'asset' : 'liability',
  };
}

/** Keep a selected nonstandard kind immediately after the last item of its type. */
export function getAccountCarouselKinds(
  type: AccountType,
  subtype: AccountSubtype,
): readonly AccountKind[] {
  const selected = getAccountKind(type, subtype);
  if (!selected) return [];
  if (type === AccountType.INCOME || type === AccountType.EXPENSE) return CATEGORY_KINDS;
  if (ACCOUNT_KINDS.some(kind => kind.key === selected.key)) return ACCOUNT_KINDS;
  const items = [...ACCOUNT_KINDS];
  const groupEnd = items.reduce((last, kind, index) => (kind.type === type ? index : last), -1);
  items.splice(groupEnd + 1, 0, selected);
  return items;
}

export function resolveAccountKindPresentation(
  type: AccountType,
  subtype: AccountSubtype,
  isEditMode: boolean,
) {
  const kind = getAccountKind(type, subtype);
  return {
    balanceLabel: isEditMode
      ? copy.currentBalance
      : type === AccountType.LIABILITY
        ? copy.owedToday
        : copy.balanceNow,
    submitLabel: isEditMode
      ? copy.saveChanges
      : copy.addKind((kind?.label ?? formatAccountSubtypeLabel(subtype)).toLowerCase()),
  } as const;
}

const KIND_WORDS: readonly {
  words: readonly string[];
  type: AccountType;
  subtype: AccountSubtype;
}[] = [
  { words: ['card', 'credit'], type: AccountType.LIABILITY, subtype: AccountSubtype.CREDIT_CARD },
  { words: ['loan', 'emi'], type: AccountType.LIABILITY, subtype: AccountSubtype.LOAN },
  { words: ['mortgage'], type: AccountType.LIABILITY, subtype: AccountSubtype.MORTGAGE },
  { words: ['savings'], type: AccountType.ASSET, subtype: AccountSubtype.BANK_SAVINGS },
  { words: ['fd', 'deposit'], type: AccountType.ASSET, subtype: AccountSubtype.FIXED_DEPOSIT },
  { words: ['cash'], type: AccountType.ASSET, subtype: AccountSubtype.CASH },
  {
    words: ['wallet', 'paytm', 'upi', 'phonepe', 'gpay'],
    type: AccountType.ASSET,
    subtype: AccountSubtype.WALLET,
  },
];

/** First matching rule in the plan's order wins when names contain several kinds. */
export function suggestAccountKind(
  name: string,
  currentKind?: SuggestedAccountKind,
): SuggestedAccountKind | null {
  const words = new Set(name.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  const suggestion = KIND_WORDS.find(rule => rule.words.some(word => words.has(word)));
  if (!suggestion) return null;
  if (currentKind?.type === suggestion.type && currentKind.subtype === suggestion.subtype)
    return null;
  return { type: suggestion.type, subtype: suggestion.subtype };
}
