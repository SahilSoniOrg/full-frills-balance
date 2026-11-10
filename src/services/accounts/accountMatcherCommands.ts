import AccountMatcher from '@/src/data/models/AccountMatcher';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  AccountMatcherConflictError,
  AccountMatcherProposalUnavailableError,
  accountMatcherRepository,
} from '@/src/data/repositories/AccountMatcherRepository';
import { preferences } from '@/src/services/preferences';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { loadAccountMatcherDiscovery } from '@/src/services/accounts/accountMatcherDiscoveryQueries';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { withAccountRecognitionRefresh } from '@/src/services/accounts/accountRecognitionRefresh';
import {
  conditionsKeyFor,
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from '@/src/services/sms/recognition/accountMatcherDefinition';
import { analytics } from '@/src/services/analytics';

export { AccountMatcherConflictError, AccountMatcherProposalUnavailableError };

export type AccountMatcherProvenance = 'discovered' | 'selected_message' | 'manual';

export interface SaveAccountMatcherInput {
  id?: string;
  accountId: AccountId;
  definition: unknown;
  provenance?: AccountMatcherProvenance;
  isEnabled?: boolean;
  /** Validate this proposal before preparing any move or save. */
  proposalKey?: string;
  /** Explicit overlap resolution; committed in the same batch as the saved draft. */
  moveMatcherId?: string;
}

async function assertEligibleOwner(workplaceId: WorkplaceId, accountId: AccountId): Promise<void> {
  const accounts = await accountQueryRepository.findAll(workplaceId);
  if (!accounts.some(account => account.id === accountId)) {
    throw new Error('Account matcher owner not found in workplace');
  }
  if (!getEligibleMatcherAccountIds(accounts).has(accountId)) {
    throw new Error('Account matchers require a leaf asset or liability account');
  }
}

function validateDefinition(value: unknown): {
  definition: AccountMatcherDefinitionV1;
  conditionsKey: string;
} {
  const result = validateAccountMatcherDefinition(value);
  if (!result.valid || !result.definition) {
    throw new Error(result.error ?? 'Invalid account matcher definition');
  }
  return { definition: result.definition, conditionsKey: conditionsKeyFor(result.definition) };
}

function validateStoredDefinition(matcher: AccountMatcher): AccountMatcherDefinitionV1 {
  const definition = parseStoredMatcherDefinition(matcher.definitionJson);
  if (!definition) throw new Error('Stored account matcher definition is invalid');
  const validated = validateDefinition(definition);
  if (validated.conditionsKey !== matcher.conditionsKey) {
    throw new Error('Stored account matcher conditions key does not match its definition');
  }
  return definition;
}

async function findOwnedMatcher(
  workplaceId: WorkplaceId,
  matcherId: string,
): Promise<AccountMatcher> {
  const matcher = await accountMatcherRepository.find(workplaceId, matcherId);
  if (!matcher) throw new Error('Account matcher not found in workplace');
  return matcher;
}

function restoreForgottenSuppressions(
  workplaceId: WorkplaceId,
  input: SaveAccountMatcherInput,
  definition: AccountMatcherDefinitionV1,
): void {
  const keys = new Set([
    conditionsKeyFor(definition),
    conditionsKeyFor({ ...definition, flow: undefined }),
  ]);
  for (const item of preferences.accountMatchers.list(workplaceId, input.accountId)) {
    if (item.reason !== 'forgotten' || !keys.has(item.conditionsKey)) continue;
    preferences.accountMatchers.restore(workplaceId, input.accountId, item.conditionsKey);
  }
}

async function saveAccountMatcherCore(
  workplaceId: WorkplaceId,
  input: SaveAccountMatcherInput,
): Promise<AccountMatcher> {
  const { definition, conditionsKey } = validateDefinition(input.definition);
  const saved = await runAccountingWriteSession(async session => {
    await assertEligibleOwner(workplaceId, input.accountId);
    const existing = input.id ? await findOwnedMatcher(workplaceId, input.id) : null;
    if (existing && existing.accountId !== input.accountId) {
      throw new Error('Account matcher owner cannot change via id; pass moveMatcherId instead');
    }
    // Validate the replacement, not the broken definition it is intended to repair.
    const moving = input.moveMatcherId
      ? await findOwnedMatcher(workplaceId, input.moveMatcherId)
      : null;
    if (moving) validateStoredDefinition(moving);
    if (input.proposalKey) {
      // Read evidence within the same writer that persists the accepted proposal.
      const discovery = await loadAccountMatcherDiscovery(workplaceId, input.accountId);
      if (!discovery.proposals.some(proposal => proposal.proposalKey === input.proposalKey)) {
        throw new AccountMatcherProposalUnavailableError();
      }
    }
    return accountMatcherRepository.saveInSession(
      session,
      workplaceId,
      {
        accountId: input.accountId,
        definition,
        conditionsKey,
        isEnabled: input.isEnabled ?? existing?.isEnabled ?? true,
        provenance: input.provenance ?? existing?.provenance ?? 'manual',
      },
      existing,
      moving,
    );
  });
  return saved;
}

async function setAccountMatcherEnabledCore(
  workplaceId: WorkplaceId,
  matcherId: string,
  isEnabled: boolean,
): Promise<AccountMatcher> {
  const updated = await runAccountingWriteSession(async session => {
    const matcher = await findOwnedMatcher(workplaceId, matcherId);
    if (isEnabled) {
      await assertEligibleOwner(workplaceId, matcher.accountId);
      validateStoredDefinition(matcher);
    }
    accountMatcherRepository.setEnabledInSession(session, workplaceId, matcher, isEnabled);
    return matcher;
  });
  return updated;
}

async function forgetAccountMatcherCore(
  workplaceId: WorkplaceId,
  matcherId: string,
): Promise<void> {
  await runAccountingWriteSession(async session => {
    const current = await findOwnedMatcher(workplaceId, matcherId);
    // Persist suppression first. A failed batch leaves recognition unchanged and only
    // suppresses future suggestions. Read the owner inside the writer to avoid a move race.
    preferences.accountMatchers.forget(workplaceId, current.accountId, current.conditionsKey);
    // A definition that does not parse still forgets from the saved conditions key above.
    const storedDefinition = parseStoredMatcherDefinition(current.definitionJson);
    const result = validateAccountMatcherDefinition(storedDefinition);
    if (result.valid && result.definition?.flow) {
      // Discovery proposes text patterns without asserting a transfer role. Forgetting a
      // role-annotated matcher must suppress that same pattern as well.
      preferences.accountMatchers.forget(
        workplaceId,
        current.accountId,
        conditionsKeyFor({ ...result.definition, flow: undefined }),
      );
    }
    accountMatcherRepository.forgetInSession(session, workplaceId, current);
  });
}

export async function saveAccountMatcher(
  ...args: Parameters<typeof saveAccountMatcherCore>
): Promise<AccountMatcher> {
  const saved = await withAccountRecognitionRefresh(args[0], () => saveAccountMatcherCore(...args));
  const input = args[1];
  const provenance = input.provenance ?? (saved.provenance as AccountMatcherProvenance);
  analytics.trackFeatureUsage('account_matcher', input.id ? 'update' : 'create', {
    ...(provenance === 'discovered' || provenance === 'selected_message' || provenance === 'manual'
      ? { provenance }
      : {}),
    enabled: saved.isEnabled,
  });
  if (!input.id && input.provenance === 'selected_message') {
    // The matcher row is the source of truth if the process dies before this preference update.
    restoreForgottenSuppressions(args[0], input, validateDefinition(input.definition).definition);
  }
  return saved;
}
export async function setAccountMatcherEnabled(
  ...args: Parameters<typeof setAccountMatcherEnabledCore>
): Promise<AccountMatcher> {
  const updated = await withAccountRecognitionRefresh(args[0], () =>
    setAccountMatcherEnabledCore(...args),
  );
  analytics.trackFeatureUsage('account_matcher', args[2] ? 'enable' : 'disable', {
    enabled: args[2],
  });
  return updated;
}
export async function forgetAccountMatcher(
  ...args: Parameters<typeof forgetAccountMatcherCore>
): Promise<void> {
  await withAccountRecognitionRefresh(args[0], () => forgetAccountMatcherCore(...args));
  analytics.trackFeatureUsage('account_matcher', 'forget');
}
