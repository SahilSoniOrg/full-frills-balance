/**
 * Evidence-driven Planned Payment settlement — Acceptance Scenarios
 *
 * Durable contract: docs/specs/evidence-driven-planned-payment-settlement/spec.md
 * Implementation plan: docs/plans/evidence-driven-planned-payment-settlement-plan.md
 *
 * All 26 acceptance scenarios from spec.md section "## Acceptance scenarios (table)"
 * are scaffolded as named describe suites with it.todo/it.skip assertions.
 * No production feature code is introduced.
 */

describe('Evidence-driven Planned Payment settlement — Acceptance Scenarios (spec.md)', () => {
  describe('Scenario 1: Unique SMS, ACTIVE plan, auto-post off, PLANNED journal exists', () => {
    it.todo(
      'posts the existing PLANNED occurrence journal using the Planned Payment accounts/lines even when auto-post is disabled',
    );
    it.todo(
      'sets journal_date to the SMS observation date (actual money movement) and sets ORIGINAL_PLANNED_DATE to the occurrence day',
    );
    it.todo('links the SMS observation to the posted journal with evidence-driven audit source');
    it.todo(
      'does not advance the recurring schedule cursor because posting claims an existing occurrence',
    );
    it.todo('leaves exactly one claiming journal and no leftover PLANNED journal for that day');
  });

  describe('Scenario 2: Unique email, generation has not run for the date, capture on', () => {
    it.todo(
      'mints a new POSTED plan-linked journal from plan accounts with ORIGINAL_PLANNED_DATE set to occurrence day',
    );
    it.todo('links the email observation to the newly minted journal');
    it.todo('advances the Planned Payment nextOccurrence cursor past that occurrence');
  });

  describe('Scenario 3: Capture would review (not auto-post) the SMS', () => {
    it.todo(
      'refuses unattended evidence-driven settlement when decideCapture returns review (posting gate fails)',
    );
    it.todo(
      'surfaces the observation in inbox review and offers the eligible occurrence as a Merge into Journal target',
    );
    it.todo('leaves the PLANNED occurrence journal unchanged');
  });

  describe('Scenario 4: Capture Uncategorized posted first; unique due plan later', () => {
    it.todo(
      'executes plan attach on the capture journal, setting planned_payment_id and ORIGINAL_PLANNED_DATE',
    );
    it.todo(
      'upgrades the Uncategorized expense allocation line to the Planned Payment category counter-account',
    );
    it.todo('resolves the allocation categorization review without leaving a fake review open');
    it.todo(
      'replaces the description with the Planned Payment name only if still the capture-generated description',
    );
    it.todo('retires (soft deletes) the occurrence PLANNED journal in the same accounting session');
    it.todo('ensures no duplicate or second journal remains on the ledger');
  });

  describe('Scenario 5: Capture journal user-categorized; unique plan later', () => {
    it.todo(
      'attaches the plan link (planned_payment_id and ORIGINAL_PLANNED_DATE) to the user-categorized capture journal',
    );
    it.todo(
      'leaves transaction lines, user-assigned categories, and description completely untouched',
    );
    it.todo('retires the occurrence PLANNED journal leaving only the single claiming journal');
  });

  describe('Scenario 6: Plan counter-account is a liability; capture line is Uncategorized expense', () => {
    it.todo(
      'detects structural conflict between liability/asset counter-account and Uncategorized expense',
    );
    it.todo('refuses unattended plan attach and blocks capture auto-post');
    it.todo('sends the item to inbox review for explicit user confirmation before linking');
    it.todo('never automatically rewrites posting lines across differing account types');
  });

  describe('Scenario 7: Two ACTIVE plans, same amount/account/day', () => {
    it.todo(
      'detects ambiguity when an observation matches more than one eligible Planned Payment occurrence',
    );
    it.todo('refuses unattended settlement or posting for both occurrences');
    it.todo(
      'routes observation to inbox review allowing the user to select which plan to Merge into Journal',
    );
  });

  describe('Scenario 8: Two pending same-amount SMS within window of one occurrence', () => {
    it.todo(
      'detects ambiguity when an occurrence matches more than one pending observation in the inbox',
    );
    it.todo('refuses unattended settlement or posting (two-sided uniqueness fails)');
    it.todo('leaves both SMS in inbox review and leaves the PLANNED journal untouched');
  });

  describe('Scenario 9: Daily plan, SMS matches', () => {
    it.todo(
      'caps the strict match window to same-day only (strict window cannot reach half of plan interval)',
    );
    it.todo('strictly settles only the exact same-day occurrence without matching adjacent days');
  });

  describe('Scenario 10: SMS two days late (weekend debit)', () => {
    it.todo(
      'identifies observation falling outside strict window (±1 day) but inside soft window (±4 days) as soft match',
    );
    it.todo('blocks ordinary capture auto-post to prevent creating a duplicate journal');
    it.todo('routes to inbox review with the occurrence offered as a Merge into Journal candidate');
  });

  describe('Scenario 11: Amount differs by fee', () => {
    it.todo(
      'identifies observation within soft amount tolerance (<= 5% difference) as a soft match',
    );
    it.todo('refuses strict match and blocks ordinary capture auto-post from minting a duplicate');
    it.todo('sends to inbox review with the occurrence presented as a Merge into Journal target');
  });

  describe('Scenario 12: SMS structure is transfer, plan is expense', () => {
    it.todo(
      'flags structural conflict when economic kind / posting shape disagrees between observation and plan',
    );
    it.todo('refuses unattended auto-identity and routes to inbox review');
    it.todo(
      'preserves the Planned Payment posting lines when user explicitly links via Merge into Journal',
    );
  });

  describe('Scenario 13: Email after SMS settled, amount/account/direction agree', () => {
    it.todo(
      'silently attaches the incoming email observation to the claiming POSTED plan-linked journal',
    );
    it.todo(
      'verifies the journal does not already have an observation from the same channel (email) and has no reference conflict',
    );
    it.todo('adds email capture provenance without creating a second journal');
  });

  describe('Scenario 14: Second SMS after SMS settled, same amount, next day', () => {
    it.todo(
      'flags second observation from the same channel (SMS) for review rather than silently attaching',
    );
    it.todo('does not silently link because it may represent a distinct separate spend');
  });

  describe('Scenario 15: Second observation with a different bank reference', () => {
    it.todo(
      'treats a differing bank reference on the same financial account as hard evidence of a different movement',
    );
    it.todo('excludes candidate journal from attachment or plan matching');
    it.todo('never attaches the observation to that journal');
  });

  describe('Scenario 16: Second email disagrees on amount or account', () => {
    it.todo(
      'refuses silent attach when incoming observation disagrees on amount or financial account',
    );
    it.todo(
      'routes observation to inbox review while still permitting manual Merge into Journal by user',
    );
  });

  describe('Scenario 17: User taps Post on an occurrence with a matching capture journal', () => {
    it.todo('never silently attaches when user initiates a manual post on an occurrence');
    it.todo(
      'prompts user with "This matches an existing transaction — link instead?" if strict or soft candidate exists',
    );
    it.todo(
      'allows user to choose between linking to the capture journal or posting a separate journal',
    );
  });

  describe('Scenario 18: FX plan (manual or automatic) + matching SMS', () => {
    it.todo('excludes Planned Payments with fxMode set from unattended settlement in v1');
    it.todo('routes matching SMS to inbox review; manual post still requires FX review');
  });

  describe('Scenario 19: SKIPPED occurrence + matching SMS', () => {
    it.todo('excludes SKIPPED occurrences from eligible settlement candidates');
    it.todo('refuses evidence-driven settlement on a skipped occurrence');
  });

  describe('Scenario 20: PAUSED or COMPLETED plan', () => {
    it.todo('excludes occurrences belonging to PAUSED Planned Payments from settlement candidates');
    it.todo(
      'excludes occurrences belonging to COMPLETED Planned Payments from settlement candidates',
    );
  });

  describe('Scenario 21: Future horizon occurrence', () => {
    it.todo(
      'excludes occurrences beyond today plus the strict window from being settlement candidates',
    );
    it.todo('never matches an observation against a future horizon occurrence');
  });

  describe('Scenario 22: Capture disabled', () => {
    it.todo('refuses unattended evidence-driven settlement when transaction capture is disabled');
    it.todo('leaves manual Planned Payment and inbox workflows unchanged');
  });

  describe('Scenario 23: Elsewhere-consumed SMS', () => {
    it.todo('refuses unattended settlement across Workplaces for elsewhere-consumed observations');
    it.todo('preserves explicit manual consume capability in the inbox');
  });

  describe('Scenario 24: Undo evidence-driven settle', () => {
    it.todo(
      'reverts the POSTED journal back to PLANNED status with original occurrence date and plan lines',
    );
    it.todo('unlinks the observation and restores it to pending inbox review');
    it.todo('audits undo event reversibly');
  });

  describe('Scenario 25: Undo plan attach', () => {
    it.todo('removes planned_payment_id link from the capture journal');
    it.todo('restores original category lines, description, and categorization review state');
    it.todo('restores the retired PLANNED occurrence journal to the ledger');
  });

  describe('Scenario 26: Dual POSTED via restore/import', () => {
    it.todo(
      'allows inbox Merge into Journal to resolve dual-POSTED duplicate journals arriving via restore or import',
    );
    it.todo(
      'prefers the sole plan-linked journal as the survivor when exactly one candidate has a Planned Payment link',
    );
  });
});
