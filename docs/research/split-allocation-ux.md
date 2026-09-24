# Split allocation UX research

Date: 2026-09-21

Scope: UX research for the guided split page. Its source-first layout describes
the common payment flow, not the accounting rule for all journals. Destination-
first drafts, native destination currencies, Equal split eligibility, and exact
balance follow [ADR 0007](../adr/0007-journal-currency-and-balancing-decision-layer.md).
"Exact cents" below means the smallest unit of each relevant currency, not a
fixed two-decimal rule.
The guided page may foreground the payment's native source amount; this does
not change the journal's stored total or currency.

## What comparable products do

### YNAB

YNAB separates choosing split categories from entering their amounts. Its split flow lets the user select all categories first, then enter amounts on a dedicated splits screen. It also supports three high-leverage shortcuts:

- Auto-distribute an unfinished remainder across empty splits.
- Leave every split at zero to divide the total evenly.
- Apply the current remaining amount directly to the selected split, which avoids typing the final number.

It also supports deleting individual splits and extending a split line into a transfer or a line with its own payee/memo. Source: [Split Transactions in YNAB](https://support.ynab.com/split-transactions-a-guide-SJLEKwY0q).

### Actual Budget

Actual keeps the parent transaction visible and represents each allocation as a child row. Its `Distribute` action adapts to the state of the draft:

- If any split is empty, divide the remainder evenly across empty rows.
- If every split already has an amount, distribute the remainder proportionally to the amounts already entered.
- Handle leftover cents one at a time so the result still balances exactly.

Source: [Split Transactions](https://actualbudget.org/docs/transactions/split-transactions/).

### Monarch Money

Monarch exposes smart splits as either dollar amounts or percentages and requires an amount condition for automated splitting. It also previews the effect on matching transactions before applying a rule. The useful idea for this page is the explicit choice between amount-based and ratio-based allocation; the rule-builder complexity does not belong in the first-entry flow.

Source: [Transaction rules](https://help.monarchmoney.com/hc/en-us/articles/360048393372-Transaction-rules).

### QuickBooks Online

QuickBooks uses a dense split table with one row per allocation and columns for category, description, customer/project, billable state, and amount. That is powerful for accounting review, but it is a poor mobile-first starting point: too many fields are visible before the user has established the basic balance.

Source: [QuickBooks Online Level 2 Manual](https://quickbooks.intuit.com/oidam/intuit/sbseg/en_us/quickbooks-online/QuickBooks-Online-Level-2-Manual-%20%282%29.pdf).

## Design decision for Full Frills Balance

The failure mode to avoid is repeating the source account inside every allocation row. It makes one payment look like several independent transactions and consumes the space needed to verify the split.

The bespoke page should use a two-part mental model:

1. Establish the payment once: total amount and `Paid from` account.
2. Allocate that payment: category rows with amounts, plus a live balance.

The page should provide:

- A single prominent total amount.
- A single source-account selector.
- A live `Allocated` / `Remaining` balance with a visual progress bar.
- One-tap `Use remaining` on any row.
- A context-aware `Distribute` action: equal across empty rows, proportional when all rows already have values.
- An explicit `Equal split` shortcut for the common 50/50 or N-way case.
- Category rows that are easy to scan, edit, remove, and add.
- Exact-cent allocation and an error state for over-allocation; never silently change a value to make the form valid.
- A focused category picker with search and grouped account sections, but no folder-style route repeated inside every row.

## What not to copy

- Do not expose accounting-only fields (customer, billable, tags, memo) in the first screen.
- Do not hide the remainder behind a save-time prompt; the user should see it while editing.
- Do not make the user type the final remainder when the app can apply it deterministically.
- Do not support percentage mode until the amount-based flow is stable. Percentage introduces rounding policy and a second mental model without solving the core journal-entry problem.
