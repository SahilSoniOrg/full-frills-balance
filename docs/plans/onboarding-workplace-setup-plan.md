# Onboarding and Workplace Setup Plan

## Decision

Import is a Workplace setup method, not an app restart or onboarding
completion action. Every import creates a new Workplace. Settings imports must
never overwrite the current Workplace.

## State model

The app has four independent concepts:

1. User setup: collect the User's display name and future profile choices.
2. Device registration: register this installation. This can complete early.
3. Workplace setup: create or import a Workplace.
4. Overall onboarding completion: set only after all required setup stages are
   complete.

Onboarding must be resumable. Persist the current stage and any setup result,
especially an imported Workplace ID. Do not use active Workplace changes as a
proxy for onboarding completion.

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

- An onboarding import never opens the dashboard before the final onboarding
  action.
- A Settings import never deletes or replaces the current Workplace.
- The current Workplace remains active while a Settings import runs.
- An imported Workplace is activated only after the user chooses to open it.
- Interrupted onboarding resumes at the saved stage.
- Future post-import steps can be inserted without changing import routing.
- Factory reset and unrelated maintenance restart behavior remain unchanged.

## Implementation slices

1. Create the persisted onboarding stage and setup-result contract.
2. Make import creation-only and return a setup result.
3. Build shared Workplace setup completion UI and actions.
4. Wire onboarding import into resumable post-import onboarding.
5. Wire Settings import with current-Workplace preservation and explicit choice.
6. Remove import-specific launch coupling.
7. Add state-transition, interruption/resume, import and navigation tests.
8. Run focused tests, architecture checks and simulator verification.
