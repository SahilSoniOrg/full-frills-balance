# Account matcher discovery

**Date:** 2026-11-06
**Status:** Agreed design; implemented through Phases 1–8. Feature flag removal waits one internal release.
**Related:** [Glossary](../../../CONTEXT.md), [confirmation boundary](../../adr/0008-confirm-discovered-account-matchers.md), [transaction capture](../automatic-transaction-capture/spec.md)

## Document responsibilities

| Document     | Authority                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Glossary     | Meaning of Account reference, Account matcher, Account matcher suggestion, Identified account, and automatic transaction capture |
| ADR          | Why confirmation, one configuration workflow, and add-by-default learning form the authority boundary |
| This spec    | Product behavior, user decisions, matching semantics, and capture evidence                  |

This spec owns the durable product contract. The ADR records why the confirmation boundary exists.

## Purpose

Compare SMS associated with an Account to propose reusable matching conditions. The User reviews the suggested pattern, selects the relevant words or phrases, and confirms how future messages recognize that Account. Matchers belong to eligible leaf asset or liability Accounts within a Workplace.

## Domain boundary

An Account matcher recognizes an Account in an SMS through one general configuration workflow. Shared transaction intelligence owns posting and review decisions under the transaction-capture contract. A matcher does not by itself authorize posting or confirm a category.

User-confirmed matchers may be as general as the User chooses, using message patterns or specific account references. Actual ambiguity and existing posting safeguards still apply.

A matcher can use only a non-empty sender condition, body fragments, a body regex, or sender plus body conditions. It must have at least one effective condition. Sender-only matching uses the same preview and explicit acceptance as other matchers.

Each matcher may also declare the matched Account's flow: Incoming means money enters this Account, Outgoing means it leaves, and Either leaves its role open. This is an interpretation of matching content, not a filter on the SMS parser's debit/credit direction. A flow declaration alone is not a matching condition. Existing matchers and discovered suggestions default to Either; discovery does not infer a flow declaration from message volume or the parser's direction.

## Evidence and discovery

1. Any SMS linked to a journal may contribute candidate evidence for that journal's eligible financial Accounts. Separate proof that the User manually selected or corrected the Account is not required. This permits linked auto-posted messages to contribute evidence; proposals still require User acceptance.
2. When account attribution is ambiguous, automatic discovery does not silently assign a reference to an Account. The User may choose the relevant text for the Account being configured.
3. Automatic suggestions require at least two distinct supporting SMS linked to at least two different journals. Several messages for one journal contribute at most one independent example; duplicate copies do not increase the count.
4. A new SMS linked to a journal involving an Account becomes new learning evidence when that Account's accepted matchers do not match it. Merely receiving an unlinked SMS is not a training label for an Account. Existing history may support proposal construction and preview, but already-covered examples do not by themselves trigger repeated proposals.
5. An Account can have multiple matchers for different message forms. SMS wording, sender, references, and other repeated fragments can inform suggestions.
6. Newly discovered matchers initially carry their observed sender constraint. Additional senders can produce additional scoped matchers. The User can deliberately broaden or remove a sender constraint during confirmation or editing.
7. Discovery compares available messages to propose editable reusable patterns, represented as regex or an equivalent condition/template format. Acceptance adds a matcher by default. Accepted matchers remain stable; replacing or editing one requires an explicit User action.

For initial setup, all eligible linked history is uncovered when the Account has no accepted matcher. After setup, uncovered linked examples can produce additional proposals. The two-SMS/two-journal threshold applies to supporting examples that actually match the proposed conditions; two unrelated examples do not satisfy the threshold merely because they belong to the same Account. Explicit message selection is the one-example alternative.

## Editing and confirmation

Account Edit contains a compact SMS recognition entry. It opens a dedicated, Account-scoped management screen where linked history is analyzed, accepted matchers are managed, and suggestions are reviewed. Only the suggestion supported by the most independent journals appears initially; the others remain available through Show more. The User can choose SMS examples or edit matching conditions in one matcher editor, including when no example is available. The Account activity screen does not host this configuration.

The editor opens a representative supporting SMS with required words highlighted and variable runs shown as `XXX`. Tapping a word toggles whether it is required; Show original reveals masked words so they can also be selected. This message view is the primary condition editor, such as selecting `ending with 1234` inside a longer card message. Reuse the presentation and highlighting conventions of the SMS preview in journal details. Raw phrase editing and regex remain available as advanced options, including when no SMS example is available. Each of the six allowed phrases has a distinct, continuous highlight across words, spaces, and punctuation. Extra phrases use the error color; a visible count and message explain that they must be joined or removed before saving.

All selected body fragments in one matcher are required in their selected message order, with variable text allowed between them. When both sender and body conditions are configured, both must match. Multiple matchers on one Account are alternatives: any one can recognize the Account, and several matches for that Account do not create an account conflict.

The editor's Flow on this account control offers Either, Incoming, and Outgoing. Changing it updates the saved definition and the unsaved-change guard without changing which SMS satisfy the text conditions. Choosing a different example preserves the User's flow choice. Saved cards state the declared Account flow beside the matching requirements. Exact ordered phrases appear once under View conditions; compact matching-SMS rows keep each linked journal attached, with the full highlighted message available through Read SMS.

Saved patterns show matching SMS and unique linked-journal counts within an explicit inspected window, including while recognition is disabled. The counts describe matching content and remain unchanged by a flow declaration. Opening a journal does not create or change links. Preview shows the target Account, sender, date, highlighted fragments, and supporting SMS. It also exposes potentially overlapping matches among messages associated with other Accounts. Such examples are evidence to inspect, not automatic proof that a candidate is wrong: a journal or SMS can involve several Accounts.

Each supporting SMS shows whether its journal was created automatically or created or reviewed by the User. Automatically created examples count toward the discovery threshold, but repeated captures are not independent User confirmation of the Account. Historical journals remain evidence with their original provenance. When every supporting example was created automatically, the preview says so before confirmation.

Only explicit User confirmation creates or changes an active matcher. Evidence volume never activates one automatically. Text selection identifies the proposed Account-related fragment; a separately confirmed flow declaration supplies that Account's source or destination role. Either leaves the role to message context or User resolution. Unresolved roles and conflicting account assignments remain review cases.

## Runtime recognition and transaction capture

Learning and runtime recognition are separate uses of SMS. Learning proposes configuration from linked examples; runtime recognition applies only confirmed, enabled, eligible matchers in the current Workplace.

Recognition supplies Account evidence to the shared capture policy. Account matchers do not select categories or description templates.

| Recognition result | Behavior |
| --- | --- |
| No Account recognized | Keep for manual review |
| One Account, supported expense/income evidence, compatible role | Capture may post only if permission, date, currency, duplicate, and Uncategorized-account gates also pass |
| Two Accounts with explicit outgoing/incoming roles and supported transfer evidence | Capture may post between those Accounts if the remaining gates pass |
| Several unresolved candidates, opposing declarations, or indeterminate recognition | Keep for review; no matcher silently wins by order |
| An individual observation already dismissed by the User | Preserve dismissal |

Repeated declarations for the same Account and flow consolidate. Either does not cancel an explicit declaration. Opposing declarations for one Account, several Accounts competing for the same transfer leg, or more than two Account candidates with declared flow require review.

For manual import, explicit outgoing and incoming declarations can prefill known journal legs. A single declaration fills only its known leg. With Either, one recognized Account can suggest the financial leg from parsed direction; several unresolved Accounts remain candidates for User choice. Fragment order alone does not establish money-flow direction.

A User's manual choice remains authoritative for the current draft without silently creating or modifying a matcher. Account recognition and category learning have separate confirmation boundaries: automatically created journals may support proposals for explicitly accepted Account matchers, but untouched automatic categories are not confirmed category labels.

Archived financial leaves remain matcher-eligible. Automatic capture applies a stricter account-availability gate and retains archived financial or Uncategorized Accounts for review; manual journal behavior is unchanged.

### Indeterminate evaluation

Each matcher evaluates to match, no match, or indeterminate. Indeterminate means evaluation could not complete: an advanced regex exceeded its evaluation budget or failed, or a stored definition no longer validates. Indeterminate is never treated as no match.

A matcher whose sender condition does not match is no match without evaluating its body. Fragment matchers do not depend on regex evaluation and cannot be indeterminate. If any enabled, eligible matcher in the Workplace is indeterminate for a message, that message's recognition is indeterminate: automatic capture waits for review and no Account is preselected from the failed evaluation. SMS recognition management flags a matcher that keeps failing so the User can fix or disable it.

## Message selection

When history provides fewer than two independent examples, the User can select messages from an inbox. One explicitly selected SMS may produce a pending suggestion because the Account context supplies the proposed association; final confirmation is still required.

The picker analyzes selected messages without importing, consuming, ignoring, or posting them and without changing journal links. Android can offer older OS SMS through a permission-gated picker. Reading older OS messages begins through Choose SMS. On iOS, selection is limited to messages already available in the app.

## Conflicts and lifecycle

- Suggestions overlapping a matcher on another Account remain visible with a warning. The User can refine conditions or the sender constraint, move an existing matcher, or explicitly confirm keeping both. Moving requires an explicit action. Ambiguous matches continue to hold automatic posting for review.
- Not now hides a suggestion for the visit. Dismiss persists for that Account and matching conditions until restored; more messages supporting the same pattern do not resurface it. Disabled matchers remain disabled. Saved definitions cover discovery evidence in both enabled and disabled states; their covered formats are not suggested again. Genuinely uncovered formats can still produce new suggestions. Removing a matcher suppresses its repeated suggestion; explicit message selection can restore it.
- Confirmed matchers are independent of their supporting history. Deleting or relinking an SMS or journal does not automatically change a confirmed matcher. Pending suggestions are rebuilt from available evidence.
- Eligibility is derived from the current Account: non-leaf or unsupported Accounts suspend recognition without overwriting the User's enabled choice. Archived leaf financial Accounts remain eligible. Soft-deleting an Account suspends owned matchers without clearing the User's enabled choice; restoring the Account restores recognition. Workplace purge removes owned matchers. Merge retargets them to the surviving Account.
- Merge treats matchers with the same normalized sender and matching conditions as duplicates and keeps one. If either copy is disabled, the kept matcher is disabled: merging never turns a matcher on. The kept matcher retains the earliest creation time. Dismissed and forgotten patterns from both Accounts carry over to the surviving Account. A dismissal never removes an accepted matcher from the other Account; it only suppresses suggestions if the User later forgets that matcher.
- Accepting a newly discovered format adds a matcher alongside existing ones. The User can later delete/forget old matchers. Explicit editing or replacement shows coverage of available old and new examples before confirmation; learning does not automatically consolidate or replace accepted matchers.
- Confirmed matchers and persistent dismissals travel with Workplace backup. Discovery does not create another archive of SMS bodies.

## Worked example

Two SMS linked to different journals involving a Credit Card Account contain different amounts and merchants but both include `your card ending with 1234`. Discovery proposes the common wording with its observed sender constraint. The User selects `your card` and `ending with 1234`, checks the preview, and confirms. Both fragments must then occur in order for that matcher to match.

A later SMS using different wording is linked to another journal involving that Account. If none of its accepted matchers covers the message, it contributes new evidence for another suggestion. Automatic proposals still require two independent supporting examples; the User may select a single example manually. Accepting the new proposal adds another matcher, preserving the old format until the User chooses to forget it.

## Delivery boundary

Phases 1–8 are implemented: matcher store and schema, recognition/pipeline holds, Account-scoped SMS recognition management and editor (including Android older-message picker and safe-subset regex), plus Playwright and Detox coverage. The `accountMatchers` feature flag stays enabled for one internal release before removal. The [transaction-capture spec](../automatic-transaction-capture/spec.md) owns the current runtime posting boundary. Capture implementation validation and rollout remain pending; this document does not claim its tests have run.
