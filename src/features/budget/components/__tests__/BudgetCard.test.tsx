import { render, fireEvent, cleanup } from '@/src/utils/test-utils';
import { BudgetCard } from '../BudgetCard';
import { BudgetListSummary } from '../BudgetListSummary';
import { BudgetProgressBar } from '../BudgetProgressBar';
import { summarizeBudgetList } from '../../helpers/budgetListPresentation';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import { asBudgetId, asAccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import type { BudgetItem } from '../../types';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';

jest.mock('@/src/utils/incompleteFxDetails', () => ({ showIncompleteFxDetails: jest.fn() }));
const today = new Date(2026, 9, 18, 12).getTime();
const item: BudgetItem = {
  budget: {
    id: asBudgetId('food'),
    name: 'Food',
    amount: 9000,
    currencyCode: 'INR',
    intervalType: 'MONTHLY',
    intervalN: 1,
    recurrenceDay: 1,
  },
  usage: { spent: 3180, remaining: 5820, budgetAmount: 9000, usagePercent: 3180 / 9000 },
  scopeAccounts: ['Groceries', 'Dining', 'Coffee'].map(name => ({
    id: asAccountId(name),
    name,
    currencyCode: 'INR',
    accountType: AccountType.EXPENSE,
  })),
  fundingAccounts: [],
};

describe('redesigned budget rows and summary', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(today);
    preferences.privacy.setIsPrivacyMode(false);
    jest.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
    jest.restoreAllMocks();
  });

  it('leads with remaining capacity, collapses category overflow and opens the budget', () => {
    const onPress = jest.fn();
    const screen = render(<BudgetCard item={item} onPress={onPress} />);
    expect(screen.getByText(/5,820.*left/)).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText(/On pace.*\/day/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /Food.*left/ }));
    expect(onPress).toHaveBeenCalledWith(item);
    expect(screen.getByTestId('budget-today-marker')).toBeTruthy();
  });

  it('rounds every budget-list amount to whole currency units', () => {
    const decimalBudget: BudgetItem = {
      ...item,
      budget: { ...item.budget, id: asBudgetId('decimal'), currencyCode: 'USD', amount: 9000.2 },
      usage: { spent: 3180.25, remaining: 5819.95, budgetAmount: 9000.2, usagePercent: 0.3533 },
    };
    const screen = render(<BudgetCard item={decimalBudget} onPress={jest.fn()} />);
    expect(screen.getByText('$5,820 left')).toBeTruthy();
    expect(screen.getByText('of $9,000')).toBeTruthy();
    expect(screen.getByText('$3,180 spent')).toBeTruthy();
    expect(screen.queryByText(/\.\d{2}/)).toBeNull();
  });

  it('rounds summary spending, remaining and limit to whole currency units', () => {
    const decimalBudget: BudgetItem = {
      ...item,
      budget: { ...item.budget, id: asBudgetId('summary-decimal'), currencyCode: 'USD' },
      usage: { spent: 3180.25, remaining: 5819.95, budgetAmount: 9000.2, usagePercent: 0.3533 },
    };
    const summary = summarizeBudgetList([decimalBudget], 'USD', today);
    const screen = render(<BudgetListSummary summary={summary} />);

    expect(screen.getByText('$5,820')).toBeTruthy();
    expect(screen.getByText('left of $9,000 limit')).toBeTruthy();
    expect(screen.getByText('$3,180 spent')).toBeTruthy();
    expect(screen.queryByText(/\.\d{2}/)).toBeNull();
  });

  it('respects final near-limit precedence over pace and renders overspend stripes', () => {
    const near = {
      ...item,
      usage: { ...item.usage, spent: 7740, remaining: 1260, usagePercent: 0.86 },
    };
    const screen = render(<BudgetCard item={near} onPress={jest.fn()} />);
    expect(screen.getByText(/Near limit.*\/day/)).toBeTruthy();
    screen.rerender(
      <BudgetCard
        item={{
          ...near,
          usage: { ...near.usage, spent: 9420, remaining: -420, usagePercent: 9420 / 9000 },
        }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(/420.*over/)).toBeTruthy();
    expect(screen.getByTestId('budget-over-segment')).toBeTruthy();
  });

  it('keeps the missing FX fix action separate from opening the budget', () => {
    const onPress = jest.fn();
    const incomplete = {
      ...item,
      usage: {
        ...item.usage,
        hasUnvaluedEntries: true,
        unvaluedEntryCount: 2,
        unvaluedCurrencyCounts: [{ currencyCode: 'JPY', count: 2 }],
      },
    };
    const screen = render(<BudgetCard item={incomplete} onPress={onPress} />);
    fireEvent.press(
      screen.getByRole('button', { name: '2 JPY entries without a rate · tap to fix' }),
    );
    expect(showIncompleteFxDetails).toHaveBeenCalledWith({
      context: 'budget',
      currencyCode: 'INR',
    });
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByText(/On pace.*\/day/)).toBeNull();
    expect(screen.getByText(/≈.*left/)).toBeTruthy();
  });

  it('uses the over state at exactly the limit', () => {
    const screen = render(
      <BudgetCard
        item={{
          ...item,
          usage: { spent: 9000, remaining: 0, budgetAmount: 9000, usagePercent: 1 },
        }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(/0.*over/)).toBeTruthy();
    expect(screen.getByText('Over by 0%')).toBeTruthy();
  });

  it('keeps zero-spent budgets free of pace wording', () => {
    const screen = render(
      <BudgetCard
        item={{
          ...item,
          usage: { spent: 0, remaining: 9000, budgetAmount: 9000, usagePercent: 0 },
        }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('nothing spent yet')).toBeTruthy();
    expect(screen.queryByText(/\/day/)).toBeNull();
  });

  it('masks row, per-day, summary and accessibility amounts in privacy mode', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(
      <>
        <BudgetCard item={item} onPress={jest.fn()} />
        <BudgetListSummary summary={summarizeBudgetList([item], 'INR', today)} />
      </>,
    );
    expect(screen.queryByText(/5,820|3,180|9,000|415/)).toBeNull();
    expect(screen.getByRole('button', { name: /Food/ }).props.accessibilityLabel).not.toMatch(
      /5,820|3,180|9,000|35%/,
    );
    expect(screen.getAllByText(new RegExp(AppConfig.privacyMask)).length).toBeGreaterThan(3);
  });

  it('keeps foreign currencies explicit and suppresses misleading common periods', () => {
    const foreign = {
      ...item,
      budget: { ...item.budget, id: asBudgetId('foreign'), currencyCode: 'USD' },
    };
    const differentAnchor = {
      ...item,
      budget: { ...item.budget, id: asBudgetId('anchor'), recurrenceDay: 15 },
    };
    const screen = render(
      <BudgetListSummary
        summary={summarizeBudgetList([item, foreign, differentAnchor], 'INR', today)}
      />,
    );
    expect(screen.getByText('+ 1 in other currencies')).toBeTruthy();
    expect(screen.queryByTestId('budget-today-marker')).toBeNull();
  });

  it('only renders the today marker when requested and explains the bar accessibly', () => {
    const screen = render(
      <BudgetProgressBar
        progress={108}
        statusColor="error"
        accessibilityLabel="Over, 108% spent"
      />,
    );
    expect(screen.queryByTestId('budget-today-marker')).toBeNull();
    expect(screen.getByRole('image', { name: 'Over, 108% spent' })).toBeTruthy();
  });
});
