import type {
  AccountMatcherContext,
  AccountMatcherFlow,
  AccountMatcherRecord,
  CompiledAccountMatcher,
  CompiledAccountMatcherBody,
  MatcherMessage,
  MatcherOutcome,
  SmsAccountRecognition,
} from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';
import { validateAccountMatcherDefinition } from './accountMatcherDefinition';
import {
  findMatcherFragmentSpans,
  normalizeMatcherText,
  SENDER_MATCH_LIMIT,
  BODY_MATCH_LIMIT,
} from './accountMatcherNormalization';
import {
  compileSafeAccountMatcherRegex,
  matchCompiledSafeAccountMatcherRegex,
} from './safeAccountMatcherRegex';

export function compileAccountMatcher(
  matcher: Pick<AccountMatcherRecord, 'id' | 'accountId' | 'definition'>,
): CompiledAccountMatcher {
  const invalid = (): CompiledAccountMatcher => ({
    id: matcher.id,
    accountId: matcher.accountId,
    status: 'invalid',
  });
  const validated = validateAccountMatcherDefinition(matcher.definition);
  if (!validated.valid || !validated.definition) return invalid();
  const definition = validated.definition;
  let body: CompiledAccountMatcherBody = null;
  if (definition.body?.kind === 'fragments') {
    body = { kind: 'fragments', fragments: definition.body.fragments };
  } else if (definition.body?.kind === 'regex') {
    const regex = compileSafeAccountMatcherRegex(definition.body.pattern);
    if (!regex) return invalid();
    body = { kind: 'regex', regex };
  }
  return {
    id: matcher.id,
    accountId: matcher.accountId,
    status: 'ready',
    sender: definition.sender ? normalizeMatcherText(definition.sender.value) : null,
    body,
    ...(definition.flow ? { flow: definition.flow } : {}),
  };
}

export function matchCompiledAccountMatcher(
  compiled: CompiledAccountMatcher,
  message: MatcherMessage,
): MatcherOutcome {
  const indeterminate = (
    reason: Extract<MatcherOutcome, { status: 'indeterminate' }>['reason'],
  ): MatcherOutcome => ({
    status: 'indeterminate',
    matcherId: compiled.id,
    accountId: compiled.accountId,
    reason,
  });
  if (compiled.status === 'invalid') return indeterminate('invalid_definition');
  if (compiled.sender !== null) {
    const sender = normalizeMatcherText(message.senderAddress.slice(0, SENDER_MATCH_LIMIT));
    if (!sender.includes(compiled.sender)) {
      return { status: 'no_match', matcherId: compiled.id, accountId: compiled.accountId };
    }
  }
  const matched = (spans: { start: number; end: number }[]): MatcherOutcome => ({
    status: 'match',
    matcherId: compiled.id,
    accountId: compiled.accountId,
    spans,
    ...(compiled.flow ? { flow: compiled.flow } : {}),
  });
  if (!compiled.body) return matched([]);
  if (compiled.body.kind === 'regex') {
    const outcome = matchCompiledSafeAccountMatcherRegex(
      compiled.body.regex,
      message.rawBody.slice(0, BODY_MATCH_LIMIT),
    );
    if (outcome === 'regex_budget') return indeterminate('regex_budget');
    return outcome === 'match'
      ? matched([])
      : { status: 'no_match', matcherId: compiled.id, accountId: compiled.accountId };
  }
  const spans = findMatcherFragmentSpans(message.rawBody, compiled.body.fragments);
  return spans
    ? matched(spans)
    : { status: 'no_match', matcherId: compiled.id, accountId: compiled.accountId };
}

/** Compiles on each call. Scan and match details compile once and then match. */
export function evaluateMatcher(
  matcher: AccountMatcherRecord,
  message: MatcherMessage,
): MatcherOutcome {
  return matchCompiledAccountMatcher(compileAccountMatcher(matcher), message);
}

export function recognizeSmsAccounts(
  context: AccountMatcherContext,
  message: MatcherMessage,
): SmsAccountRecognition {
  const outcomes = context.matchers
    .filter(m => m.isEnabled && m.eligible)
    .map(m => matchCompiledAccountMatcher(m.compiled, message));
  const accountIds = [...new Set(outcomes.filter(o => o.status === 'match').map(o => o.accountId))];
  const flowsByAccount = new Map<AccountId, Set<AccountMatcherFlow>>();
  for (const outcome of outcomes) {
    if (outcome.status !== 'match' || !outcome.flow) continue;
    const flows = flowsByAccount.get(outcome.accountId) ?? new Set<AccountMatcherFlow>();
    flows.add(outcome.flow);
    flowsByAccount.set(outcome.accountId, flows);
  }
  const flows = [...flowsByAccount].flatMap(([accountId, values]) =>
    [...values].map(flow => ({ accountId, flow })),
  );
  const status = outcomes.some(o => o.status === 'indeterminate')
    ? 'indeterminate'
    : accountIds.length
      ? 'recognized'
      : 'none';
  return { status, accountIds, outcomes, ...(flows.length ? { flows } : {}) };
}
