# Journal currency consistency implementation plan

Status: Journal write-boundary cutover complete; currency and reporting follow-through in progress

Date: 2026-09-24

Decision authority: [ADR 0007](../adr/0007-journal-currency-and-balancing-decision-layer.md). [CONTEXT.md](../../CONTEXT.md) defines terms. [Split allocation research](../research/split-allocation-ux.md) informs the guided UI, not journal storage.

## Outcome and boundary

For every new ordinary journal, save the current Workplace currency as Journal.currencyCode and the balanced total in that currency. Save each line's native amount and currency, with a per-line effective rate into Journal.currencyCode when needed. On edit, use the journal's saved currency; on duplicate or reversal that copies rates, keep the source currency. All ordinary creators use one balance and save calculation.

This is the existing ordinary storage convention made consistent. There is no database migration, metadata version, old-row conversion, foreign operating-currency exception, or second persisted total. A USD account view may show $10 while its journal-wide total is ₹800 in an INR Workplace.

## Progress as of 2026-09-24

### Completed

- Ordinary journal create, update, post, duplicate, reversal, merge, bulk operations, account adjustments, planned-payment workflows, and SMS writes now use `JournalPersistenceRepository` through `JournalPersistenceService` or an `AccountingWriteSession`. The former ledger create/update/lifecycle layer and journal write repository were removed in commit `9d11b579`.
- Repository `put` creates or updates and `post` validates the planned-to-posted transition. Posted balance validation runs against persisted account currencies and status inside the write boundary; totals must balance exactly at supported precision. Non-posted journals may be out of balance.
- Saved journal currency is preserved on edits even if Workplace currency changes. Account currency is immutable. No schema migration, data migration, or journal rules marker was added.
- Editor hydration carries the saved journal currency and line values. Opening an editor does not refresh rates; explicit refresh uses the journal date. Account-scoped journal views carry the account's native currency.
- Bulk rename and undo remain available. They now use a generic sparse `put` inside one accounting write session; they do not replace transaction rows.
- New-workplace restore retains its separate import writer and preflights posted balances before publication.

### Pending

- Reports still convert a transaction from its native currency straight to the requested report currency using the line's stored rate. They do not consistently convert through the saved journal currency and then use a historical journal-date quote. The report path also does not pass the journal date to that quote lookup. This can reinterpret a line-to-journal rate as a line-to-report rate, including treating a valid stored rate of `1` as unusable.
- A sparse nonmonetary `put` retains transaction rows, but currently validates those rows again. That can reject an old posted journal during a description, notes, or date-only edit if its historical lines fail today's validation. Date-only edits still need to update transaction dates and rebuild caches without changing amounts or rates. This conflicts with the ADR's requirement that nonmonetary edits preserve old postings without revalidation.
- The guided editor still requests legacy balance feedback while advanced mode requests exact feedback. The repository prevents an unbalanced posted journal from being saved, but editor feedback should use the same exact evaluator in every mode.
- Prove Ivy transfer amount/rate meaning from source fixtures before changing import mapping. Cashew remains out of scope while its importer is nonfunctional; no deployed Cashew data is known to require conversion.
- Remove or isolate remaining legacy calculation/fallback branches only after their callers have moved to the shared evaluator. In particular, a missing foreign rate must never become a usable saved rate of `1`.

The persistence-boundary status and its verification details are in the [journal write-boundary cutover plan](journal-write-boundary-cutover-plan.md). The remaining steps below concern currency calculation, edit behavior, reporting, and source-proven import fixes.

## Current findings

| Path | Finding | Needed correction |
| --- | --- | --- |
| Ordinary save | All production writes now reach the new persistence boundary. The repository enforces exact posted balance; the UI still has legacy feedback in guided mode. | Use the same evaluator for guided and advanced feedback; keep repository validation decisive. |
| Editor reopen | The editor hydrates the saved journal currency and line values. Opening does not refresh rates; explicit refresh is date-based. | Add/retain end-to-end coverage for edits after Workplace currency changes and old rows with uncertain rates. |
| Nonmonetary edits | Generic sparse `put` preserves lines but revalidates them. | Allow description/notes/date-only edits to preserve historical amounts and rates without applying new monetary validation. Date-only edits may update transaction dates and rebuild balances. |
| Balance/rate | A shared evaluator and exact repository gate exist. The guided editor still asks for legacy feedback; other legacy helpers remain to be audited. | Route every editor through exact feedback and remove missing-rate-as-1 behavior from reachable paths. |
| Read models | Account-scoped journal views now carry native account currency; journal-wide views use the saved journal total/currency. | Verify every budget and daily-net presentation uses the intended currency, not just the journal timeline. |
| Reports | Report conversion can apply a stored line rate directly to the requested target and omits the journal-date lookup context. | Convert native line to saved journal currency, then journal currency to report currency using the journal date; honor a valid stored rate of 1. |
| Split | Currency-aware split allocation and destination currency presentation are implemented. | Keep split math aligned with the shared evaluator and exact residual rule across edit and create flows. |
| Direct creators | Ordinary creators and composite workflows have been cut over to the persistence service/repository session. | Verify currency/rate semantics per creator; a cutover alone does not prove each path supplies correct valuation data. |
| Historical import | Restore preflight is in place and history is not migrated. | Add source-proven Ivy fixtures and fix only mappings proven by source fields. Cashew remains excluded. |

Credit is the source role and debit the destination role in current guided and enriched paths. Account type names are not the role.

## Implementation order

### 0. Characterize the current contract

**State:** Partially complete. The codebase and direct writers have been inventoried, and focused tests cover exact balance, editor hydration/rate behavior, restore preflight, and persistence cutover. A complete round-trip matrix across Workplace currency changes, report targets, and ambiguous imported rates remains pending.

Add database-backed fixtures for an ordinary mixed-currency journal through save, read, editor reopen, edit, duplicate, reversal, and native export/restore. Record journal currency/total and each line's native amount/currency/rate. Include a Workplace default-currency change, supported precision examples, a valid cross-currency rate of 1, and an old journal that the new exact-balance check would reject. Inventory direct writers and account/report consumers.

**Exit:** current behavior is pinned without asserting the new fixes. The earlier pasted plan's “Phase 0 complete” described code inspection, not these executable checks.

### 1. Repair reads and saved-entry hydration

**State:** Partially complete. Saved currency hydration, no-refresh-on-open, explicit journal-date refresh, and account-scoped currency presentation are implemented. The report conversion path remains incorrect for the agreed two-step journal-currency valuation.

Pass Journal.currencyCode and total into editor state. Treat the account's locked currency as the unit of its native line amount; check any saved Transaction.currencyCode mismatch before monetary editing. Do not fetch rates on editor mount. Carry account currency through EnrichedJournal, account-view timeline, budget, and daily-net projections. This account-scoped read slice is implemented. Journal-wide views keep the saved journal total/currency; account-scoped views show the selected native line.

For reports, use a trusted stored rate only from line currency to the saved journal currency. A present positive rate, including 1, is valid; absence means missing. Convert onward to a requested target with a historical quote at the journal date. Surface missing/uncertain quotes rather than using a spot fallback.

**Exit:** existing ordinary entries reopen with unchanged values; description, notes, and date edits preserve old postings without revalidation; mixed account views use correct units; reporting survives a later Workplace default-currency change. No database write shape changes.

### 2. One evaluator and authoritative save path

**State:** The repository/service write boundary and exact posted-balance gate are complete. The shared exact feedback path is not complete: guided mode still uses legacy feedback, and retained historical rows are revalidated by sparse nonmonetary `put` operations. Complete these before claiming the full evaluator rollout.

Reuse PostingPlan with a supplied journal currency: current Workplace default for new manual entry, saved Journal.currencyCode for edit, or source journal currency for a copy that preserves rates. Resolve missing reference quotes separately; keep user-entered effective rates. A pure evaluator returns native and journal-currency line values, both side totals, exact difference, saved total candidate, and structured issues.

Quantize native lines at their currencies' precision and final journal values at journal-currency precision. Save only when debit and credit totals are exactly equal in integer minor units. Derive from either complete side only when ownership permits; never overwrite a user-owned amount or rate. Equal split and Distribute use journal currency, convert each destination to its native currency, and assign unavoidable residuals only among derived lines.

Make the save coordinator repeat evaluation after preview. Pass the validated journal currency/total through JournalService.postPostingPlan and prepareJournalData; neither may choose a larger side or substitute a missing rate. First route one complete advanced-editor create/edit path through it.

The repository cutover is complete; see the [journal write-boundary cutover plan](journal-write-boundary-cutover-plan.md). Keep evaluator work aligned with it: UI checks provide feedback, while the repository is the final posted-balance gate.

**Exit:** ADR cases and precision tests pass; preview equals persisted result; an unbalanced or missing-rate monetary draft cannot save. A nonmonetary edit to an older journal does not rewrite its lines. The current persisted fields are unchanged.

### 3. Move the remaining editors

**State:** Currency-aware split allocation exists, but shared exact feedback is incomplete across editor modes. The guided path currently uses legacy feedback before the repository's exact save check.

Move simple/TransactionIntent, split, then bulk through the same evaluator and coordinator. Split components collect inputs and display Equal split/Distribute capability; they do not own FX, balance, or destination currency fallback. Refresh reference rates only on explicit request, using the journal date by default.

**Exit per editor:** equivalent postings save the same journal currency, native lines, effective rates, and total; reopen/edit does not change values without user action.

### 4. Move other ordinary creators

**State:** Persistence cutover complete. The remaining work here is to verify each creator's currency context, native amounts, and effective rates against the accepted semantics; do not repeat the completed writer migration.

Adapt SMS auto-post, planned occurrences, account adjustments, duplicate/reversal, bulk duplicate, and merge one at a time. Resolve both account currencies. Preserve inbox links and planned occurrence/schedule side effects in their existing atomic write. Reversal copies actual saved postings and rates. Merge must not add incomparable native amounts or discard rates; reject unsupported shapes.

**Exit per path:** integration coverage proves saved fields, workflow side effects, and reopen. No ordinary creator bypasses the shared balance/save authority.

### 5. Keep historical import separate

**State:** Restore preflight and no-migration policy are implemented. Ivy source-contract proof and any resulting narrowly scoped future-import correction remain pending. Cashew stays excluded while its importer is nonfunctional.

Native restore continues to preserve IDs, timestamps, raw values, running-balance reconstruction, and atomic publication. Do not rewrite old local journals or assign them a version. Add source fixtures for Ivy transfers with distinct source/base/destination currencies. Correct a future import mapping only when source fields prove the amounts and rate direction; otherwise retain raw values or an explicit missing rate with a warning. An old imported row with unprovable rate meaning must not be silently recalculated during a monetary edit. Cashew import is outside this plan while its importer is nonfunctional; there is no deployed Cashew history to migrate.

**Exit:** proven source mappings and warning paths have fixtures; native restore remains lossless and atomic; no bulk history conversion occurs.

### 6. Remove duplicate calculation branches

**State:** Pending. The legacy guided feedback policy and any reachable missing-rate fallbacks must be removed or constrained after all consumers use the exact evaluator. The old journal writer layer itself has already been removed.

Remove missing-rate-as-1 defaults, larger-side saved total selection, and obsolete UI-side allocation/balance decisions after their callers move. Restrict ordinary CreateJournalData construction and prepareJournalData calls to the coordinator and explicit adapters. Keep historical restore on an explicit allowlist.

**Exit:** full ADR matrix, create/edit/reopen, direct-creator, read/report, and import fixture checks pass. No unclassified ordinary direct writer remains.

## Historical limit

Older imported rate directions may be opaque. The project guarantees no rewrite of those rows and avoids silent recalculation; it cannot guarantee that every historical import already obeys the ordinary line-to-journal rate convention.

## Release acceptance

New ordinary data uses the same journal/line field meanings as existing ordinary data, with exact balance and one shared calculation path. Saved entries remain stable on reopen and edit. Account views show native currencies; journal-wide views show journal currency. Reports use the saved journal currency as the historical conversion base. Local history is not migrated or reclassified.
