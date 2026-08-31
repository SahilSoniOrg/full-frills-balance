# Onboarding and Workplace Setup Plan

> This plan reflects the agreed model from the onboarding design review. The final confirmation, not the Workplace step, is the database commit point.

## Decision

Keep the complete onboarding flow. Persist a versioned Device-scoped MMKV draft through explicit checkpoints, then write the Workplace and starter books only after the user reviews and confirms the final summary. Imported users skip Workplace setup but use the same Appearance → Review → Confirmation sequence.

## State model

The app has four independent concepts:

1. User setup: collect the User's display name and appearance choices.
2. Device registration: register this installation at the name checkpoint.
3. Workplace draft: collect Workplace identity, currency, accounts, and categories without creating books.
4. Overall onboarding completion: write the accepted draft in one transaction, then set completion and open the app.

Stages are `user_profile`, `workplace_setup`, `appearance`, `review`, and `complete`. Keep `post_import` as the import entry state, then normalize into Appearance. Persist the stage and full draft in Device-scoped MMKV. Do not use active Workplace changes as a proxy for onboarding completion.

## Required behavior

- Name submission is a checkpoint.
- Leaving Workplace setup is a draft checkpoint, not a database write; currency is Workplace data.
- Account setup includes assets and liabilities; only assets are preselected.
- Category setup includes income and expenses.
- Require at least one account, one income category, and one expense category.
- Appearance remains inside onboarding and is a draft choice until final confirmation.
- Review shows User name, Workplace name/icon, currency, account count, category count, and theme.
- Review `Change` actions return to draft steps.
- `Confirm and enter app` is the only first-run database commit and completion action.
- Imported users skip Workplace setup and enter Appearance, then use the same Review confirmation.

## Import behavior

Both entry points use the same import service:

- Onboarding: import creates a Workplace, then returns to post-import
  onboarding steps.
- Settings: import creates a separate Workplace, leaves the current Workplace
  untouched and active while importing, then offers explicit actions to open
  the imported Workplace or stay on the current one.

Import returns a setup result containing the Workplace ID, counts, warnings and
backup metadata. It does not choose navigation or complete Device/onboarding
state.

## Launch coordination

Launch coordination owns launch gating, recovery and active Workplace repair.
It must not redirect or remount the app because an import is in progress or
because an in-place setup result is being acknowledged.

## Acceptance criteria

- Default, full, and imported onboarding never opens the dashboard before the final confirmation action.
- A Settings import never deletes or replaces the current Workplace.
- The current Workplace remains active while a Settings import runs.
- An imported Workplace is activated only after the user chooses to open it.
- Interrupted onboarding resumes at the saved stage with all draft choices intact.
- Future post-import steps can be inserted without changing import routing.
- Factory reset and unrelated maintenance restart behavior remain unchanged.

## Implementation slices

1. Add versioned Device draft persistence and explicit stage values.
2. Hydrate the flow from the draft and persist checkpoint transitions.
3. Refactor numeric step routing and progress to named stages.
4. Add liability defaults, custom Asset/Liability selection, category grouping, and minimum validation.
5. Keep appearance in onboarding and make its next action `Review setup`.
6. Add the editable Review step with explicit commit copy.
7. Move `completeOnboarding` to Review confirmation; preserve operation-ID retry safety and visible errors.
8. Align imported onboarding and remove the stale finalize expectation.
9. Update copy, analytics, Playwright, Detox, and Maestro coverage.
10. Run focused tests, architecture checks, and simulator QA.

## Definition of done

- No Workplace/books rows exist before final confirmation for default/full setup.
- The draft survives app termination and resumes correctly.
- Review is editable without losing choices.
- Custom accounts have explicit Asset/Liability semantics.
- The minimum selections are enforced with inline explanation.
- Commit failure keeps the draft and exposes retry.
- Imported and new users share the same final confirmation behavior.
- Existing import, recovery, and pointer-repair guarantees remain intact.
