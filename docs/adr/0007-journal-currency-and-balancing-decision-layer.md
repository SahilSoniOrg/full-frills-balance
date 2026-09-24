# Journal currency and balancing

Status: Accepted; amended 2026-09-23

The earlier proposal to give a uniform foreign journal a foreign operating currency is withdrawn. One journal currency now serves both the saved total and balancing. This keeps ordinary new entries in the same stored shape as ordinary existing entries.

## Problem

Journal creation paths currently choose currency, FX, balance, and total in different places. Ordinary saves select Workplace currency, while planned payments, SMS, adjustments, and imports can choose differently. Save preparation can use the larger of two sides as the total. Some validators treat a missing foreign rate as 1. Editor loading drops the saved journal currency, and account views can label a native line amount with the journal currency.

The goal is one accounting result for equivalent ordinary postings, without rewriting local history or introducing a second persisted format.

## Stored meaning

- Journal.currencyCode is the currency of Journal.totalAmount and of journal balancing. A new manual journal takes the Workplace default at creation. Editing keeps the saved journal currency even if the Workplace default later changes.
- Journal.totalAmount is the equal debit/credit total in Journal.currencyCode after validation. It is never the larger of mismatched sides.
- Each transaction line stores its native amount in its account currency. New writers also store that currency in Transaction.currencyCode. A saved mismatch between the transaction and account currencies is an inconsistency to surface for monetary editing; do not silently reinterpret the account balance or rewrite the old row.
- A foreign line's exchangeRate, when its meaning is known, is units of journal currency per one unit of that line's currency. Each line has its own effective rate. A line already in journal currency needs no rate.
- A new ordinary journal requires a valid positive rate for every foreign line. An unavailable reference quote can be supplied manually. Missing is never silently replaced with 1.
- A present positive rate of 1 is valid even when the two currencies differ. The absence of a rate, not its numerical value, means missing.

This decision adds no database column, metadata version, second journal total, shared rate object, or bulk rewrite of existing rows.

## Concrete examples

With an INR Workplace, a journal moving $10 between two USD accounts stores $10 on each account line. At ₹80 per dollar, each line is worth ₹800. The journal stores totalAmount 800 and currencyCode INR. An account view may show $10; the journal's stored total remains ₹800.

A journal with a $10 source and an €8 destination can also balance at ₹800 when the USD line uses ₹80 per dollar and the EUR line uses ₹100 per euro. Its line amounts remain $10 and €8; its journal total is ₹800.

If the Workplace default later changes to EUR, those saved journals remain INR journals. New manual journals use EUR. Reports that target EUR convert historical INR journal values at the journal date; saved rates are not reinterpreted as USD-to-EUR or EUR-to-EUR quotes.

## Balance and input rules

Credit lines are source legs and debit lines are destination legs in the current guided and enriched paths. Account type names do not determine source or destination.

The evaluator values each line in its journal currency: native amount when currencies match, otherwise native amount multiplied by that line's effective rate. It returns both side totals and the difference. It does not select a winning side.

- When one side is complete and the other is empty, a single empty opposing line may be derived. With several empty lines, show the required total and let the user allocate it.
- When both sides contain user-entered values, preserve them. Show the exact difference; do not silently change an amount, valuation, or rate.
- A user-entered amount, valuation, or rate is authoritative until explicitly changed. Reference rates initialize or refresh a draft, but do not overwrite manual values on reopen. Explicit refresh uses the journal date by default.
- Equal split and Distribute work in journal currency, then express each destination in its own native currency. The evaluator owns capability, conversion, and residual decisions; the UI supplies input and displays results. The source currency is never a fallback label for a destination.

Quantize native amounts at their currency precision and each final journal-currency value at journal-currency precision. Debit and credit totals must be exactly equal in integer minor units before save. Assign unavoidable split residuals deterministically among derived lines only. An unresolved residual is a visible draft imbalance. No automatic FX Equity posting hides it.

## Calculation and write boundary

Use the existing PostingPlan seam for ordinary creators. The plan's currencyCode is supplied by context: current Workplace default for a new manual journal, saved Journal.currencyCode for an edit, and the source journal currency for a duplicate or reversal that preserves saved rates. No separate operating-currency selection step is needed.

An asynchronous resolver may obtain missing reference quotes. A pure evaluator calculates line values, side totals, allocation, total, saveability, and structured issues without I/O or UI strings. Preview may evaluate early for feedback, but the final validation belongs inside the journal persistence repository's database writer transaction. `put` creates or updates and checks the effective saved status; `post` validates persisted planned lines before committing the posted transition. Persistence preparation maps a validated result to the existing fields and must not decide currency, substitute a rate, or choose the larger side.

Every new ordinary creator eventually uses this boundary, including editors, SMS auto-post, planned occurrences, and account adjustments. Workflow metadata and planned-occurrence side effects remain atomic with the journal write. Full historical restore remains a separate publication path with an explicit posted-balance preflight policy. The [journal write-boundary cutover plan](../plans/journal-write-boundary-cutover-plan.md) defines the layered implementation sequence and current bypasses.

## Reading, editing, and reporting

Reopen a saved journal with its stored journal currency, total, native line amounts/currencies, and effective rates. Do not refresh rates on mount. A reversal copies actual saved postings and rates, without a new market lookup. A duplicate that copies saved rates also keeps the source journal currency unless the user explicitly requests conversion.

Journal-wide lists use Journal.totalAmount with Journal.currencyCode. Account-scoped views use the selected line's native amount and its account's locked currency. Budget and daily-net projections must not label a native amount with the journal currency. Transaction.currencyCode should agree with the account; a historical mismatch needs separate review.

A trusted stored line rate converts that line to the journal currency only. To report in another currency, convert the journal-currency value to the target at the journal date. If a required quote is unavailable, surface that gap; do not silently use today's spot quote.

## Existing data and imports

No old row is rewritten or assigned a new semantics marker. Ordinary existing journals already generally save the Workplace currency as Journal.currencyCode; characterize and preserve their create/read/edit round trip before changing writers. Some historical direct writers and import formats do not prove that every stored rate points to journal currency. Do not infer rate direction from its number or from closeness to a market quote.

Keep native restore's IDs, timestamps, balances, and atomic publication. Correct an Ivy source mapping only where source fixtures prove the values and direction. Future imported rows that lack a proven rate keep an explicit missing/uncertain rate and warning. Older local imported rows stay as stored. If a monetary edit needs an unprovable old rate, require an explicit effective rate for that edit rather than silently recalculating it. Cashew import is outside this decision while its importer is nonfunctional and has no deployed user history to preserve.

Changing only a saved journal's description, notes, or date must not force its
old postings through new balance rules or rewrite its amounts and rates.
Changing monetary fields uses the new validation and may require the user to
resolve an old mismatch explicitly.

## Implementation status (2026-09-24)

The production writer cutover is complete: ordinary journal mutations use the
new persistence repository/service, and the former ledger write layer has been
removed. The cutover did not change the decisions above.

Two implementation gaps remain. First, generic sparse `put` currently
revalidates retained lines even for a description, notes, or date-only edit,
which can reject a historical posted journal despite no monetary change.
Date-only edits still need to update transaction dates and rebuild caches
without changing amounts or rates. Second, reports
can apply a saved line rate directly to the requested report currency instead
of converting through the saved journal currency at the journal date. The
guided editor also still uses legacy balance feedback while advanced mode uses
exact feedback; the repository remains the final exact posted-balance gate.
These gaps are tracked in the [implementation plan](../plans/journal-currency-unification-plan.md)
and are not changes to the accepted policy.

## Non-goals

- No change to the meaning of Journal.currencyCode for ordinary entries.
- No schema or bulk data migration, journal version marker, or automatic normalization of historical rows.
- No second journal total or per-currency balancing accounts.
- No automatic FX adjustment posting.
- No global application of a stored line rate to an unrelated report currency.

The [implementation plan](../plans/journal-currency-unification-plan.md) owns rollout order and tests. [CONTEXT.md](../../CONTEXT.md) owns the terms.
