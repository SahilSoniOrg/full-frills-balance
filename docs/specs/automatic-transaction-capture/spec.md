# Automatic transaction capture

**Date:** 2026-11-07
**Status:** Capture, review, and historical SMS suggestion backfill are implemented; integration validation and rollout remain pending. Tests have not been run for this change.
**Related:** [Glossary](../../../CONTEXT.md), [Account matchers](../account-matcher-discovery/spec.md)

## Boundary

SMS ingestion supplies source facts and confirmed Account-matcher evidence. Shared transaction intelligence classifies the economic kind and proposes a balanced journal or a review outcome. The existing journal domain validates and persists the result.

Transaction capture now has one policy for automatic posting and review. It does not seed category confirmation from prior inbox status or automatically assigned journal lines. Existing journals remain ordinary journals.

The capture release records established movements and lets the User categorize the resulting journal. Confirmed history can suggest a category for review. A one-time backfill can also use historical SMS-linked journal classifications as review-only suggestions. Users must explicitly approve a historical pattern before it becomes a prospective category default. Users can explicitly save category and description defaults or keep a merchant open. Voice integration with shared intelligence remains separate work.

Normal capture-history suggestions use explicitly confirmed, single-category journals for the same merchant, financial account, movement kind and currency. Conflicting categories or split history suppress suggestions. Automatic entries and unchanged generated categories do not teach the matcher. Choosing to keep a merchant open suppresses suggestions and explicitly saved automatic names for that merchant. Description defaults require a deliberate user action and apply prospectively to the same merchant, amount, currency and movement kind; they never classify or confirm a category.

Historical SMS backfill is separate from confirmed capture history. It records source facts for posted journals that have exact SMS links, grouping all SMS observations by journal so several messages for one movement count once. Candidate groups require a merchant consensus, one eligible financial Account, one eligible income/expense category, and source amount/currency values that agree with the journal. Split, transfer, conflicting-source, mixed-category, or incomplete records do not produce a category default suggestion. A historical candidate stays review-only until the User approves its category; approval saves a prospective category default and does not change old journal lines or enable capture. SMS inbox status is not category confirmation.

Historical patterns preserve each SMS merchant label independently. Labels that differ only by case, accents, spacing, or punctuation may appear as possible name matches with links to their own past journals. These are review-only references: they do not merge evidence, create aliases, or save a shared default. Approving a historical category saves it for the selected pattern's merchant under the existing matcher semantics.

An explicitly approved category default applies prospectively only to the same merchant, financial Account, movement kind, and currency. The User can choose a confirmed single-category entry even when other history conflicts; no whole-merchant default is inferred from a split. The decision revalidates the category as an eligible leaf of the expected type and currency and falls back to Uncategorized if it is no longer valid. A default allocation is recorded as `default`, with review state `defaulted`; neither it nor inactivity constitutes an individual User confirmation or supplies a learning label. Users can remove defaults or pause them with keep-open. Account merges retarget references conservatively; backup restore remaps them and restores capture disabled.

A review entry shows a naming prompt when the same account, merchant, movement, currency, and amount appear in confirmed entries on at least two earlier days. This is a conservative initial heuristic, not measured evidence that the purchases have the same purpose. Keeping a merchant open suppresses the prompt.

## Enablement and write ownership

- Capture is off by default in each Workplace. The old default-true SMS auto-post preference grants no permission to the replacement.
- The existing Automation area offers explicit enablement with an explanation of the resulting writes. Device SMS listening and OS SMS permission remain separate source controls.
- Enabling provisions explicit Uncategorized income/expense Account roles for current eligible financial-account currencies, then records a new activation cutoff. Disable and capture decisions serialize with accounting writes. Re-enabling starts a new cutoff.
- Only `arrival` and `catch_up` scans may capture, and only for messages strictly after the cutoff. Initial, manual, and historical scans do not automatically post. Elsewhere-consumed observations remain manual review cases.
- Once an observation is retained for review, later matcher or account-configuration changes do not promote it to an automatic journal. It remains available for explicit manual import.
- Capture has one decision authority: shared transaction intelligence evaluates each eligible source observation once.
- Missing/invalid date, amount, currency, Account roles, counterpart mapping, unsupported FX, or an unresolved duplicate candidate prevents automatic posting. Currency must agree with every recognized financial leg; the first release does not infer an exchange rate.

The source adapter extracts semantic evidence; it does not choose a category or authorize a write. A generic debit or credit and a high parser confidence score do not establish economic kind.

## Supported SMS classification catalog

The examples below are synthetic and contain no real account or merchant information. They describe the supported classifier contract, not measured coverage of all bank messages. Every positive assumes an enabled Workplace, an eligible scan after the cutoff, valid parsed amount/currency/date, no duplicate, and eligible Accounts.

| Synthetic message                                              | Required Account evidence                                                                                                 | Outcome                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `INR 450 spent on Card XX1234 at MARKET on 06-Nov-2026.`       | Exactly one Card Account; Either or Outgoing; parsed debit                                                                | Expense to the mapped Uncategorized expense Account; needs categorization |
| `Salary INR 50000 credited to A/c XX5678 via NEFT.`            | Exactly one bank Account; Either or Incoming; parsed credit                                                               | Income to the mapped Uncategorized income Account; needs categorization   |
| `INR 1000 transferred from A/c XX5678 to Card XX1234 via UPI.` | Two owned financial Accounts, with one explicit Outgoing and one explicit Incoming declaration; same established currency | Transfer between those Accounts; category review not applicable           |
| `INR 450 debited from A/c XX5678.`                             | One bank Account                                                                                                          | Review: direction alone does not establish spending                       |
| `INR 450 transferred to PERSON via UPI.`                       | Only the outgoing Account known                                                                                           | Review: external/unresolved transfer                                      |
| `Salary account credited INR 450.`                             | One bank Account                                                                                                          | Review: account naming alone is not salary evidence                       |
| `INR 450 refunded to Card XX1234.`                             | One Card Account                                                                                                          | Review: refund treatment needs its original movement                      |
| `Loan INR 50000 credited to A/c XX5678.`                       | One bank Account                                                                                                          | Review: credit is not proof of income                                     |
| `INR 450 withdrawn at ATM using Card XX1234.`                  | One Card Account                                                                                                          | Review: withdrawal is not established spending                            |
| `INR 450 purchase on Card XX1234 at MARKET is pending.`        | One Card Account                                                                                                          | No automatic write: incomplete movement                                   |
| `OTP 123456 for INR 450 purchase on Card XX1234 at MARKET.`    | One Card Account                                                                                                          | No automatic write: authorization request                                 |

Implementation evidence rules are deliberately narrow:

- Purchase evidence requires purchase/spent/POS wording, card/POS context, and an `at` location. It still needs parsed debit and one compatible financial Account.
- Salary evidence requires explicit salary-credit wording, excluding a generic `salary account` mention. Salary-credit evidence takes precedence over transfer-rail words such as NEFT; rail words alone do not establish income.
- Transfer evidence includes transfer/UPI/NEFT/IMPS/RTGS wording. Posting additionally requires two explicit compatible financial roles; several Account matches alone are insufficient.
- Refunds/reversals remain review-only. Cashback, loan, withdrawal/ATM, and otherwise unclassified forms also remain review-only.
- Incomplete, failed, future, or authentication-related wording prevents automatic capture. Unsupported forms remain review rather than falling back to merchant/amount similarity.
- Amount evidence is checked separately from parser confidence. A clearly labeled balance can coexist with a uniquely identified transaction amount; conflicting amounts without a clear transaction statement stay in review.

The executable extraction and classification owners are `smsEconomicEvidence.ts` and `captureDecision.ts`. Parser coverage must be assessed against representative source messages before rollout; this document does not claim the catalog has passed tests.

## Uncategorized Account roles

Roles are durable Account IDs scoped by Workplace, economic kind, and currency. A matching display name never adopts an unrelated Account. Renaming preserves the role. Merging retargets the mapping; archived, deleted, non-leaf, wrong-type, or wrong-currency mappings block capture with a configuration reason.

Provisioning and validation reuse the accounting writer and normal Account persistence. It does not write a journal to make the role exist. Adding a financial Account in a new currency later does not silently create a category during a scan. Automation offers account setup when a mapping is missing; setup preserves the existing activation cutoff and messages already held for review remain there.

Archived financial leaves remain eligible for matcher recognition, but automatic capture requires available, unarchived financial leaves. Manual posting and Account-matcher eligibility retain their existing semantics.

## Journal-owned review and provenance

Capture metadata lives in the existing `JournalMetadata.metadataJson` under `transactionCapture`. One canonical record contains the original merchant, economic kind, category allocations and their origins/confirmation, Uncategorized role IDs, and source observations. Several observations share that journal's review state.

Historical SMS source facts use a separate versioned `historicalSmsEvidence` value in `JournalMetadata.metadataJson`. It contains deduplicated source IDs, occurrence times, parsed merchant, amount and currency; it does not contain category confirmation. The backfill is idempotent and Workplace-scoped. It consolidates multiple metadata rows and linked inbox records for one journal into one evidence set while preserving the other metadata rows.

- Automatic expense/income capture is POSTED and `needs_categorization`. Balances and reports include its movement through the Uncategorized Account.
- Category selection edits the same journal through the existing editor. Required unresolved split allocations keep review open.
- Description-only edits do not confirm a category. Original merchant identity remains separate from editable descriptions and continues to inform duplicate suggestions.
- Explicit User classifications record allocation-level confirmation. Automatic values, inactivity, and merely opening a journal do not.
- Review can explicitly confirm an existing unconfirmed category without changing its Account. Confirmation rechecks the displayed allocations and journal lines in the accounting writer; a stale review or an Uncategorized allocation is rejected.
- Entries categorized by a saved default remain separate from confirmed history. Automation lists them for optional per-entry confirmation; doing nothing does not create a learning label.
- New manual SMS journals can preserve source facts and explicit category choices. Existing journals are not blanket-marked confirmed or added to the review queue.
- Later corrections replace affected labels while preserving unchanged confirmed allocations. Merges and Account retargeting preserve source identity and update allocation references.
- An additional observation does not reopen completed category review or count as another independent User classification.

Source links, posting status, and categorization review are separate concerns. Similar merchant and amount may suggest reconciliation; they do not prove transaction identity or authorize another journal.

## Automation and manual review

Automation links to a dedicated capture workspace containing capture controls, activity/inbox links, source settings, and reminders. Categorization and suggestions have separate pages. The review queue refreshes on focus and exposes additional pages without a hidden result cap. Entries open the existing journal editor; no second journal store is introduced.

SMS settings retain listening, notification, and inbox controls. Account matcher management remains attached to Accounts. Pending inbox entries expose a concrete capture-review reason when available.

When a Workplace needs an Account-matcher refresh, pending SMS suggestions are recomputed from current matchers before they appear in inbox and notification previews. Processed and dismissed entries are not revived.

Voice retains parse → apply to draft → User save. Parsing/applying creates no journal, cancel creates none, and enabling SMS capture does not post voice drafts or historical voice inbox records. Existing voice journals and records remain editable/importable.

## Persistence and compatibility

- Capture stages journal persistence and inbox disposition/linking within the existing accounting write session. Permission, recognition, Account eligibility, and duplicate state are revalidated there.
- Preserve existing exact source identity, duplicate reservations, dismissal/deletion intent, and cross-Workplace consumption safeguards. Possible matches remain review cases.
- Capture metadata travels through normal journal backup/sync fields. Restore remaps category/Uncategorized Account IDs and preserves source observations when supplemental Account references are missing. Unmappable classifications become unconfirmed baseline allocations from the restored journal; they cannot retain confirmation against foreign Account IDs or become confirmed by a description-only edit.
- Capture settings restore disabled with their cutoff cleared; valid role IDs are remapped. Restored settings are not renewed consent to unattended writes.
- The historical SMS evidence and backfill version survive native backup/restore. Source IDs have no Account references to remap; current journal lines and Accounts are revalidated before a suggestion is shown.
- A database migration drops the obsolete SMS rule tables. Capture configuration, category defaults, and historical SMS evidence use the current Workplace preference and journal-metadata contracts.

## Validation still required

No tests were run for this implementation. Before rollout, verify classification positives/confusing alternatives, explicit consent/cutoff and queued-disable behavior, missing Account mappings, same-source replay, transfer-side observations, review after edits/splits, historical SMS backfill idempotency, multiple SMS observations for one journal, conflicting source IDs, mixed-category suppression, privacy, deletion/restore, voice draft/import behavior, cross-source reconciliation, and native backup/restore. Type checking alone does not establish runtime accounting or device behavior.
