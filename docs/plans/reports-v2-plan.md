# Reports V2

## Status

Proposed greenfield reporting subsystem.

Reports V2 is not a compatibility layer for the existing reports feature. It owns its own domain contracts, query model, calculators, UI, and tests. The legacy reporting implementation may remain temporarily while V2 is built, but V2 must not depend on it.

## Objective

Give a person a trustworthy answer to five questions:

1. How much did I earn and spend during this period?
2. Where did the money go?
3. How did cash, debt, and net worth change?
4. Did actual activity match my budgets and planned payments?
5. Can I trust the numbers, and can I get to the journal entries behind them?

The product is a personal financial reporting system, not a generic analytics dashboard. Charts are a presentation of accounting results. They are not the source of truth.

## Product principles

### Ledger first

Every number must be derivable from posted journal lines, account metadata, budgets, or planned-payment definitions.

### Flow and balance are different

Income and expenses are flows over a period. Assets, liabilities, equity, and net worth are balances at a point in time. They must not share ambiguous calculations.

### Economic activity and cash movement are different

A credit-card purchase creates an expense and debt, but does not immediately remove cash from a bank account. A card payment moves cash and reduces debt, but is not a second expense.

### Actuals and forecasts are different

Posted journals are historical actuals. Planned payments are forecasts. A forecast may be shown beside actuals, but it must never silently contaminate historical reports.

### Every aggregate is inspectable

Any chart segment, KPI, or table row must support drill-down to the journals and lines that produced it.

### Missing data is visible

Missing exchange rates, unbalanced journals, uncategorized activity, and incomplete account metadata produce warnings. They must not silently disappear from totals.

## Domain model

### Account

An Account is a ledger bucket. It has an account type, optional subtype, currency, and optional parent. Only leaf accounts receive journal lines. Parent accounts summarize descendants.

Account types:

- Asset
- Liability
- Equity
- Income
- Expense

Subtypes are useful reporting dimensions, not replacements for account identity. Food and transport may be expense subtypes. Bank savings and brokerage may be asset subtypes.

### Journal

A Journal is one balanced accounting event. It contains one or more transaction lines, a date, status, description, source, and optional planned-payment link.

### Transaction line

A transaction line posts a positive amount to one Account as either a debit or credit. Reporting derives the signed account effect from the account type and transaction type.

### Reporting fact

A Reporting fact is an immutable read-side representation of one posted transaction line enriched with the journal and account context required for reporting.

```ts
type ReportingFact = {
  workplaceId: WorkplaceId;
  journalId: JournalId;
  transactionId: TransactionId;
  journalDate: number;
  journalStatus: JournalStatus;

  accountId: AccountId;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  parentAccountId?: AccountId;
  accountPath: AccountId[];
  isLeafAccount: boolean;

  transactionType: TransactionType;
  amount: number;
  currencyCode: string;
  historicalBaseAmount?: number;

  signedBalanceDelta: number;
  journalDisplayType: JournalDisplayType;
  semanticType?: SemanticType;

  description?: string;
  notes?: string;
  plannedPaymentId?: PlannedPaymentId;
};
```

The fact preserves journal and transaction identity. Aggregation happens after facts are loaded, never before. This is what makes chart drill-down, audit reports, transfer classification, and future dimensions possible.

## V2 architecture

```text
Reports V2 UI
    |
    v
Reports V2 view model
    |
    v
ReportQueryEngine
    |
    +--> ReportingPolicy
    +--> LedgerFactReader --------> journal/account repositories
    +--> CurrencyValuation         exchange-rate reader
    +--> ReportCalculators
    +--> ReportIntegrity
    +--> ReportDrilldown
    |
    v
Chart-neutral ReportResult
```

### Public module interface

Expose one primary read interface:

```ts
interface ReportQueryEngine {
  run(query: ReportQuery): Promise<ReportResult>;
  drillDown(query: ReportDrilldownQuery): Promise<JournalId[]>;
}
```

The interface hides status rules, sign rules, account-tree traversal, currency valuation, aggregation, and performance decisions. UI modules should not query transactions directly to calculate financial meaning.

### Query contract

```ts
type ReportQuery = {
  workplaceId: WorkplaceId;
  period: {
    startDate: number;
    endDate: number;
    timeZone: string;
  };
  targetCurrency: string;

  basis: 'ACTUAL' | 'ACTUAL_PLUS_PLANNED';
  comparison: 'NONE' | 'PREVIOUS_PERIOD' | 'PREVIOUS_YEAR';
  granularity: 'AUTO' | 'DAY' | 'WEEK' | 'MONTH';

  accountIds?: AccountId[];
  accountTypes?: AccountType[];
  includeArchivedAccounts?: boolean;
};
```

The query must have one period definition. All cards, graphs, tables, and drill-downs inherit it.

### Reporting policy

The policy is shared by every report:

- Include posted journals.
- Include a reversal exactly once. Original and reversing entries must not both create duplicate economic activity.
- Exclude drafts, skipped journals, and planned journals from `ACTUAL`.
- Include planned journals only in `ACTUAL_PLUS_PLANNED`, with a visible forecast marker.
- Exclude deleted journals and deleted lines.
- Aggregate leaf accounts by default.
- Use journal date as the accounting date.
- Use historical exchange rates for period flows.
- Use end-of-period valuation for balance reports.
- Preserve a warning when exchange-rate conversion fails.
- Apply the existing money precision rules at every aggregation step.

## Core measures

Every report should use named measures rather than anonymous signed numbers.

### Period flow measures

- Gross income
- Income reversals
- Net income
- Gross expense
- Refunds and expense reversals
- Net expense
- Net operating flow
- Savings rate
- Cash inflow
- Cash outflow
- Internal transfers
- Borrowing
- Debt payments
- Equity activity

### Point-in-time measures

- Assets at period start
- Assets at period end
- Liabilities at period start
- Liabilities at period end
- Net worth at period start
- Net worth at period end
- Net worth change
- Cash-equivalent balance
- Debt utilization

### Reconciliation measures

- Net income
- Net worth change
- Contributions and withdrawals
- Transfers
- Debt principal movement
- Currency valuation movement
- Unexplained difference

The reconciliation report is necessary because net worth change and income minus expense are not always equal. Currency movements, asset purchases, loans, and equity adjustments can create valid differences.

## Report catalogue

### 1. Overview

Purpose: answer “How did I do this period?”

Sections:

- Income, expense, net flow, and savings-rate KPIs.
- Comparison against the selected comparison period.
- Net-worth trend.
- Income versus expense trend.
- Top spending categories.
- Largest positive and negative changes.
- Budget status.
- Upcoming commitments.
- Data-quality warnings.

Recommended visuals:

- KPI cards for exact amounts.
- Line chart for net worth.
- Stacked bars for income and expense by period.
- Ranked horizontal bars for category changes.

### 2. Cash Flow

Purpose: answer “Where did liquid money move?”

Sections:

- Cash-equivalent opening balance.
- Inflows and outflows.
- Net cash movement.
- Internal transfers.
- Borrowing and debt repayment.
- Closing cash-equivalent balance.

Cash-equivalent assets should initially include cash, wallet, checking, savings, and money-market subtypes. Brokerage, receivables, and long-term investments should not be treated as ordinary cash without an explicit liquidity policy.

Recommended visuals:

- Inflow/outflow stacked bars.
- Waterfall from opening to closing cash.
- Account-level cash balance trend.

### 3. Spending

Purpose: answer “What did I spend money on?”

Dimensions:

- Expense account.
- Expense subtype.
- Parent account path.
- Journal semantic type.
- Description or payee when available.
- Planned-payment link.
- Budget link.

Metrics:

- Gross expense.
- Refunds.
- Net expense.
- Number of journals.
- Average transaction size.
- Period-over-period change.

Do not label journal descriptions as reliable merchant analytics until a first-class payee field exists.

Recommended visuals:

- Ranked category bars.
- Category trend lines.
- Gross versus refunds versus net expense.
- Detail table with drill-down.

### 4. Income

Purpose: answer “Where did money come from, and how stable is it?”

Dimensions:

- Income account.
- Income subtype.
- Account path.
- Journal description or source.

Metrics:

- Net income by source.
- Income concentration.
- Monthly consistency.
- Largest source changes.

### 5. Net Worth

Purpose: answer “Am I getting wealthier?”

Sections:

- Assets by account and subtype.
- Liabilities by account and subtype.
- Net worth over time.
- Asset-to-liability ratio.
- Net worth change reconciliation.
- Optional equity reconciliation.

Recommended visuals:

- Assets and liabilities area chart.
- Net-worth line chart.
- Endpoint balance table.
- Waterfall explaining the period change.

Investment performance must not be inferred from balance changes. True performance requires holdings, prices, contributions, withdrawals, and valuation dates.

### 6. Budget Performance

Purpose: answer “Did actual spending match the plan?”

For each budget:

- Budgeted amount.
- Actual gross expense.
- Refunds.
- Net actual.
- Remaining amount.
- Percentage used.
- Expected spend at current pace.
- Variance.
- Unbudgeted expense.

Recommended visuals:

- Budget versus actual bars.
- Cumulative spend versus budget line.
- Overspending table.

Budget matching must use the budget scope and leaf expense accounts. It must not match by display label.

### 7. Debt

Purpose: answer “How is debt changing?”

Sections:

- Debt balance by liability account.
- Opening versus closing debt.
- Borrowing.
- Principal repayment.
- Interest and fees where separately modeled.
- Credit utilization where credit-limit metadata exists.
- Minimum-payment and due-date status.

If principal and interest are not represented as separate accounting lines, V2 must not pretend it can calculate them accurately. It may show total payments only.

### 8. Planned Payments and Forecast

Purpose: answer “What will happen if the current plan holds?”

This is a forecast surface, not a historical report.

Sections:

- Upcoming planned payments.
- Expected inflows.
- Expected outflows.
- Projected cash balance.
- Projected budget consumption.
- Low-balance warnings.

Actual and planned values must be visually and numerically separate.

### 9. Report Health

Purpose: answer “What could make this report incomplete?”

Checks:

- Unbalanced journals.
- Missing account references.
- Uncategorized or `OTHER` activity.
- Missing exchange rates.
- Duplicate reversal activity.
- Planned entries accidentally included in actuals.
- Archived accounts with historical activity.
- Stale or missing balance projections.
- Accounts with unsupported subtype metadata.

This surface is not optional. Trust is a feature.

## User experience

### Global report header

Every report screen shares one filter context:

- Date range.
- Comparison period.
- Target currency.
- Account scope.
- Actual or actual-plus-planned basis.
- Granularity.

Changing the filter refreshes every visible section. There should not be separate hidden date state inside individual cards.

### Navigation

V2 should use a new screen and new feature module. Suggested sections:

1. Overview
2. Cash Flow
3. Spending
4. Net Worth
5. Debt
6. Budgets
7. Forecast
8. Health

The initial implementation may ship Overview, Spending, Net Worth, and Cash Flow first, but the contracts should support the complete catalogue.

### Drill-down

Each result carries enough information to form a `ReportDrilldownQuery`:

```ts
type ReportDrilldownQuery = {
  baseQuery: ReportQuery;
  startDate?: number;
  endDate?: number;
  accountIds?: AccountId[];
  accountTypes?: AccountType[];
  accountSubtypes?: AccountSubtype[];
  journalIds?: JournalId[];
  semanticTypes?: SemanticType[];
};
```

Drill-down opens the existing journal-entry presentation only after V2 has resolved the journal IDs. The journal list is a detail surface, not the reporting engine.

### Chart rules

- Lines for balances and trends.
- Stacked bars for composition over time.
- Horizontal bars for rankings.
- Waterfalls for reconciliations.
- Tables for exact values.
- Donuts only when the number of segments is small.
- Sankey only as an optional explanatory view, never as the accounting source.
- Hourly heatmaps only if timestamps represent meaningful event time. Otherwise remove them.

All monetary values need an accessible text equivalent and must respect the app privacy-mask behavior.

## Proposed module layout

```text
src/services/reports-v2/
  types/
    reportQuery.ts
    reportingFact.ts
    reportResult.ts
    reportMeasures.ts
  policy/
    reportingPolicy.ts
    reportingPeriods.ts
    currencyValuation.ts
  reader/
    ledgerFactReader.ts
    accountScopeReader.ts
    budgetFactReader.ts
    plannedFactReader.ts
  classification/
    journalClassification.ts
    flowClassification.ts
  calculators/
    overviewCalculator.ts
    cashFlowCalculator.ts
    spendingCalculator.ts
    incomeCalculator.ts
    netWorthCalculator.ts
    budgetCalculator.ts
    debtCalculator.ts
    forecastCalculator.ts
    healthCalculator.ts
  query/
    reportQueryEngine.ts
    reportDrilldown.ts
  __tests__/
    fixtures/
    reportQueryEngine.test.ts
    reportingPolicy.test.ts
    ...

src/features/reports-v2/
  screens/ReportsV2Screen.tsx
  components/
  hooks/
  viewModels/
  navigation/
```

The calculators should be pure. The reader and currency modules are the only places that know about persistence and exchange-rate adapters. The UI consumes chart-neutral results and does not calculate accounting signs.

## Delivery phases

### Phase 0: Contract and fixture foundation

Deliver:

- V2 type contracts.
- Reporting policy.
- Fact fixture builder.
- Golden ledger scenarios.
- Result assertion helpers.

Required fixtures:

1. Salary into checking.
2. Cash expense.
3. Credit-card purchase.
4. Credit-card payment.
5. Checking to savings transfer.
6. Refund.
7. Loan borrowing.
8. Loan repayment.
9. Opening balance.
10. Equity adjustment.
11. Reversal pair.
12. Multi-currency income and expense.
13. Split expense.
14. Planned payment beside posted history.
15. Budget-scoped and unbudgeted expense.

Exit criteria: all fixture scenarios produce hand-calculated results for flows, balances, net worth, and classification.

### Phase 1: Fact reader and policy

Deliver:

- Posted-journal fact reader.
- Account-tree enrichment.
- Journal classification.
- Historical FX valuation.
- End-of-period balance valuation.
- Missing-data diagnostics.

Exit criteria: facts are complete, scoped by Workplace, date, status, currency, and account filters, with no UI dependency.

### Phase 2: Core reports

Deliver:

- Overview.
- Spending.
- Income.
- Cash Flow.
- Net Worth.

Build the new V2 screen and components from scratch. Do not adapt the old report snapshot or old report view model.

Exit criteria: all core sections use one query context, support comparison, show exact values, and drill down to journals.

### Phase 3: Budgets, debt, and forecast

Deliver:

- Budget versus actual.
- Unbudgeted activity.
- Debt balances and payments.
- Planned-payment forecast.
- Projected cash balance.

Exit criteria: actual and planned values are separate, budget matching follows account scope, and debt payment is not counted as a new expense.

### Phase 4: Health, exports, and performance

Deliver:

- Report Health screen.
- CSV or shareable report export.
- Query caching where measurements justify it.
- Large-ledger performance tests.
- Offline behavior and loading states.

Exit criteria: no silent omissions, stable results after data mutation, and acceptable performance for the largest expected local ledger.

### Phase 5: Cutover and legacy removal

Cutover sequence:

1. Route `/reports` to the V2 screen.
2. Run the complete regression and end-to-end suite.
3. Remove imports of the legacy report service, snapshot types, calculators, and feature components.
4. Remove legacy-only tests and chart adapters.
5. Remove the old wealth-reporting path if no non-reporting consumer requires it.
6. Keep shared accounting primitives only when they have independent callers and tests.

Do not delete the legacy implementation before V2 has parity against the fixture suite. “The screen looks right” is not parity.

## Test strategy

### Unit tests

- Debit and credit effects for every AccountType.
- Flow classification.
- Transfer exclusion.
- Credit-card purchase versus payment.
- Refund handling.
- Reversal handling.
- Account-tree aggregation.
- Date boundaries and time zones.
- Previous-period and previous-year comparison.
- Historical versus spot FX.
- Missing FX warnings.
- Budget scope matching.
- Planned versus posted separation.
- Debt utilization.
- Reconciliation differences.

### Integration tests

- Fact reader Workplace isolation.
- Deleted and archived records.
- Rebuildable balance behavior.
- Repository fallback behavior.
- Journal mutation refresh.
- Account filter refresh.
- Planned-payment lifecycle.

### UI tests

- Filter changes refresh every section.
- Chart segment opens the correct journal list.
- Empty states are meaningful.
- Forecast values are visually distinct.
- Privacy masking applies to every amount.
- Health warnings are visible without blocking valid reports.
- Long category lists remain usable.

### Performance tests

Measure:

- Initial report load.
- Re-query after one journal mutation.
- One-year daily report.
- Multi-year monthly report.
- Large account tree.
- Multi-currency ledger.
- Drill-down query latency.

Avoid fetching full transaction objects when a report only needs aggregated facts. Avoid N+1 account or journal queries.

## Risks and decisions

### Risk: false precision in cash flow

An Asset account is not automatically cash. Use an explicit liquidity policy and make it visible in the report definition.

### Risk: double-counted debt activity

Credit-card purchases, card payments, loans, and repayments must be classified from the complete journal, not from isolated transaction lines.

### Risk: misleading net-worth history

Historical balances in multiple currencies require a declared valuation policy. A current spot rate applied across historical dates can create fake wealth movement.

### Risk: hidden refunds

Gross expense, refunds, and net expense must be separate measures. A category that nets to zero should not vanish without explanation.

### Risk: oversized custom-report builder

Do not start with arbitrary user-defined formulas. Ship a fixed catalogue with reliable semantics first. Custom reports are a later product once the fact model has proven itself.

### Risk: chart-first design

A dashboard full of graphs can still fail to answer what changed or why. Every section needs exact totals, comparisons, and drill-down.

## Acceptance criteria

Reports V2 is ready to replace the legacy system when:

- All core reports run from the V2 query engine.
- No V2 UI imports legacy report contracts or calculators.
- Every monetary result has a defined accounting meaning.
- Actual and planned activity are separate.
- Transfers and debt payments are not double-counted as expenses.
- Multi-currency behavior is explicit and warnings are visible.
- Every chart supports journal drill-down.
- Parent-account totals do not double-count leaf accounts.
- Report results are covered by golden fixtures.
- Health checks explain incomplete or questionable data.
- The old route and implementation can be deleted without changing V2 behavior.

## Final recommendation

Build V2 as a new reporting product with a single query engine, canonical enriched facts, pure report calculators, and a chart-neutral result contract.

Keep the existing reporting code out of the V2 dependency graph. Reuse only lower-level accounting and persistence primitives that pass V2 tests. Delete the legacy system after cutover, not before.
