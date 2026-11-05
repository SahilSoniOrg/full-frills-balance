import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import type { AccountMatcherSuppression } from '@/src/services/preferences/workplaceTypes';
import type { AccountId } from '@/src/types/ids';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { InboxProcessingStatus } from '@/src/types/enums';
import { findSmsHighlightRanges } from '@/src/services/journal/smsHighlightRanges';
import { tokenizeSmsWords } from '@/src/services/journal/smsTextSpans';
import {
  conditionsKeyFor,
  parseStoredMatcherDefinition,
  validateAccountMatcherDefinition,
} from './accountMatcherDefinition';
import { evaluateMatcher } from './accountMatcherEvaluator';
import {
  BODY_MATCH_LIMIT,
  normalizeMatcherText,
  normalizeSenderHeader,
} from './accountMatcherNormalization';

// The LCS table below is quadratic in token count. Skip unusually dense messages
// instead of blocking the JS thread or deriving a matcher from partial tokens.
const MAX_DISCOVERY_TOKENS = 128;

export interface AccountMatcherDiscoveryMessage extends InboxRecordSnapshot {
  /** Account membership is derived from current, non-deleted journal transactions. */
  linkedAccountIds: AccountId[];
  linkedAccountNames?: string[];
  contentDigest?: string;
}

export interface AccountMatcherDiscoveryMatcher {
  id: string;
  accountId: AccountId;
  definition: unknown;
  conditionsKey: string;
  isEnabled: boolean;
}

export interface AccountMatcherDiscoveryExample {
  message: AccountMatcherDiscoveryMessage;
  provenance: 'auto_posted' | 'created_or_reviewed';
}

export interface AccountMatcherProposal {
  proposalKey: string;
  accountId: AccountId;
  definition: AccountMatcherDefinitionV1;
  examples: AccountMatcherDiscoveryExample[];
  supportJournalIds: string[];
  overlaps: { messageId: string; accountIds: AccountId[] }[];
  allExamplesAutoPosted: boolean;
}

export interface SuppressedAccountMatcherProposal extends AccountMatcherProposal {
  suppression: AccountMatcherSuppression;
}

export interface DiscoverAccountMatcherProposalsInput {
  accountId: AccountId;
  evidence: readonly AccountMatcherDiscoveryMessage[];
  comparisonMessages?: readonly AccountMatcherDiscoveryMessage[];
  matchers: readonly AccountMatcherDiscoveryMatcher[];
  suppressions?: readonly AccountMatcherSuppression[];
}

export interface AccountMatcherDiscoveryResult {
  proposals: AccountMatcherProposal[];
  /** Qualifying candidates kept out of the pending list so the User can restore them. */
  suppressedProposals: SuppressedAccountMatcherProposal[];
}

interface TokenEvidence {
  index: number;
  start: number;
  end: number;
  text: string;
  normalized: string;
  masked: boolean;
  accountLike: boolean;
}

function messageIdentity(message: AccountMatcherDiscoveryMessage): string[] {
  const keys = [`source:${message.deviceSourceId}`];
  if (message.contentDigest) keys.push(`digest:${message.contentDigest}`);
  return keys;
}

function dedupeMessages(
  messages: readonly AccountMatcherDiscoveryMessage[],
): AccountMatcherDiscoveryMessage[] {
  const seen = new Set<string>();
  return messages.filter(message => {
    const keys = messageIdentity(message);
    if (keys.some(key => seen.has(key))) return false;
    keys.forEach(key => seen.add(key));
    return true;
  });
}

function accountLikeToken(tokens: ReturnType<typeof tokenizeSmsWords>, index: number): boolean {
  const token = tokens[index];
  if (!token || !/\d/.test(token.text)) return false;
  const previous = tokens[index - 1]?.text.toLocaleLowerCase();
  const previousPrevious = tokens[index - 2]?.text.toLocaleLowerCase();
  return (
    /^(?:x{2,}|\*{2,})\d{2,}$/i.test(token.text) ||
    (Boolean(previous) && /^(?:ending|account|card|acct)$/.test(previous!)) ||
    (previous === 'in' && previousPrevious === 'ending')
  );
}

function tokensFor(message: AccountMatcherDiscoveryMessage): TokenEvidence[] | null {
  // Discovery must only use text the runtime matcher can actually inspect.
  const body = (message.rawBody ?? '').slice(0, BODY_MATCH_LIMIT);
  const words = tokenizeSmsWords(body);
  if (words.length > MAX_DISCOVERY_TOKENS) return null;
  const date = new Date(message.inputDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const shortYear = `${year}`.slice(-2);
  const highlights = findSmsHighlightRanges(body, {
    amount: message.parsedAmount,
    accountHint: message.parsedAccountSource,
    merchant: message.parsedMerchant,
    reference: message.referenceNumber,
    date: [
      `${year}-${month}-${day}`,
      `${month}/${day}/${year}`,
      `${day}/${month}/${year}`,
      `${month}-${day}-${shortYear}`,
      `${day}-${month}-${shortYear}`,
    ],
  });
  return words.map(token => {
    const overlapping = highlights.filter(
      range => token.start < range.end && token.end > range.start,
    );
    const accountLike =
      overlapping.some(range => range.kind === 'account') || accountLikeToken(words, token.index);
    return {
      ...token,
      normalized: normalizeMatcherText(token.text),
      masked: overlapping.some(range => range.kind !== 'account') && !accountLike,
      accountLike,
    };
  });
}

function structureKey(tokens: readonly TokenEvidence[]): string {
  return tokens.map(token => (token.masked ? '*' : token.accountLike ? '#' : 'w')).join(' ');
}

interface CommonToken {
  normalized: string;
  accountLike: boolean;
  positions: number[];
}

function longestCommonTokens(entries: readonly { tokens: TokenEvidence[] }[]): CommonToken[] {
  const first = entries[0]?.tokens ?? [];
  let common: CommonToken[] = first
    .filter(token => !token.masked)
    .map(token => ({
      normalized: token.normalized,
      accountLike: token.accountLike,
      positions: [token.index],
    }));

  for (const entry of entries.slice(1)) {
    const nextTokens = entry.tokens.filter(token => !token.masked);
    const scores = Array.from({ length: common.length + 1 }, () =>
      Array<number>(nextTokens.length + 1).fill(0),
    );
    for (let i = 1; i <= common.length; i += 1) {
      for (let j = 1; j <= nextTokens.length; j += 1) {
        const up = scores[i - 1][j];
        const left = scores[i][j - 1];
        const token = nextTokens[j - 1];
        const match =
          common[i - 1].normalized === token.normalized
            ? scores[i - 1][j - 1] + 1 + (common[i - 1].accountLike || token.accountLike ? 1 : 0)
            : -1;
        scores[i][j] = Math.max(up, left, match);
      }
    }

    const matches: { commonIndex: number; token: TokenEvidence }[] = [];
    let i = common.length;
    let j = nextTokens.length;
    while (i > 0 && j > 0) {
      const token = nextTokens[j - 1];
      const weight = 1 + (common[i - 1].accountLike || token.accountLike ? 1 : 0);
      if (
        common[i - 1].normalized === token.normalized &&
        scores[i][j] === scores[i - 1][j - 1] + weight
      ) {
        matches.push({ commonIndex: i - 1, token });
        i -= 1;
        j -= 1;
      } else if (scores[i - 1][j] >= scores[i][j - 1]) i -= 1;
      else j -= 1;
    }
    common = matches.reverse().map(({ commonIndex, token }) => ({
      normalized: common[commonIndex].normalized,
      accountLike: common[commonIndex].accountLike || token.accountLike,
      positions: [...common[commonIndex].positions, token.index],
    }));
    if (!common.length) break;
  }
  return common;
}

function fragmentsFor(
  entries: readonly { tokens: TokenEvidence[]; message: AccountMatcherDiscoveryMessage }[],
): string[] {
  const common = longestCommonTokens(entries);
  const firstTokens = new Map(entries[0]?.tokens.map(token => [token.index, token]));
  const body = entries[0]?.message.rawBody ?? '';
  const fragments: string[] = [];
  let runStart: CommonToken | undefined;
  let previous: CommonToken | undefined;
  const flush = () => {
    const start = runStart ? firstTokens.get(runStart.positions[0]) : undefined;
    const end = previous ? firstTokens.get(previous.positions[0]) : undefined;
    if (start && end) fragments.push(body.slice(start.start, end.end));
    runStart = undefined;
    previous = undefined;
  };
  for (const token of common) {
    if (token.accountLike) {
      flush();
      const accountToken = firstTokens.get(token.positions[0]);
      if (accountToken) fragments.push(body.slice(accountToken.start, accountToken.end));
      continue;
    }
    if (
      runStart &&
      previous &&
      token.positions.some((position, index) => position !== previous!.positions[index] + 1)
    ) {
      flush();
    }
    runStart ??= token;
    previous = token;
  }
  flush();
  const stopWords = new Set([
    'a',
    'an',
    'at',
    'by',
    'for',
    'from',
    'in',
    'of',
    'on',
    'the',
    'to',
    'with',
  ]);
  return fragments
    .filter(fragment => {
      const normalized = normalizeMatcherText(fragment);
      return (
        normalized.length > 0 && !(normalized.split(' ').length === 1 && stopWords.has(normalized))
      );
    })
    .slice(0, 6);
}

function definitionFor(sender: string, fragments: readonly string[]): AccountMatcherDefinitionV1 {
  const definition: AccountMatcherDefinitionV1 = { version: 1 };
  if (sender) definition.sender = { op: 'contains', value: sender };
  if (fragments.length) definition.body = { kind: 'fragments', fragments: [...fragments] };
  return definition;
}

function matcherDefinition(
  matcher: AccountMatcherDiscoveryMatcher,
): AccountMatcherDefinitionV1 | null {
  const value =
    typeof matcher.definition === 'string'
      ? parseStoredMatcherDefinition(matcher.definition)
      : matcher.definition;
  const validated = validateAccountMatcherDefinition(value);
  return validated.valid ? (validated.definition ?? null) : null;
}

function messageMatches(
  accountId: AccountId,
  definition: AccountMatcherDefinitionV1,
  message: AccountMatcherDiscoveryMessage,
): boolean {
  const outcome = evaluateMatcher(
    { id: 'account-matcher-discovery', accountId, definition, isEnabled: true, eligible: true },
    { senderAddress: message.senderAddress ?? '', rawBody: message.rawBody ?? '' },
  );
  return outcome.status === 'match';
}

function hasAccountReference(
  message: AccountMatcherDiscoveryMessage,
  fragments: readonly string[],
): boolean {
  const body = (message.rawBody ?? '').slice(0, BODY_MATCH_LIMIT);
  const ranges = findSmsHighlightRanges(body, {
    accountHint: message.parsedAccountSource,
  }).filter(range => range.kind === 'account');
  if (
    ranges.some(range =>
      fragments.some(fragment => {
        const start = body.toLocaleLowerCase().indexOf(fragment.toLocaleLowerCase());
        return start >= 0 && start < range.end && start + fragment.length > range.start;
      }),
    )
  )
    return true;
  return (tokensFor(message) ?? []).some(
    token =>
      token.accountLike &&
      fragments.some(fragment => {
        const start = body.toLocaleLowerCase().indexOf(fragment.toLocaleLowerCase());
        return start >= 0 && start < token.end && start + fragment.length > token.start;
      }),
  );
}

function provenanceFor(
  message: AccountMatcherDiscoveryMessage,
): AccountMatcherDiscoveryExample['provenance'] {
  return message.processingStatus === InboxProcessingStatus.AUTO_POSTED
    ? 'auto_posted'
    : 'created_or_reviewed';
}

function proposalOverlaps(
  accountId: AccountId,
  definition: AccountMatcherDefinitionV1,
  messages: readonly AccountMatcherDiscoveryMessage[],
): AccountMatcherProposal['overlaps'] {
  const seen = new Set<string>();
  return messages.flatMap(message => {
    const accountIds = [...new Set(message.linkedAccountIds.filter(id => id !== accountId))];
    if (!accountIds.length || !messageMatches(accountId, definition, message)) return [];
    const key = `${message.id}:${accountIds.sort().join(',')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ messageId: message.id, accountIds }];
  });
}

/** Pure proposal construction over linked, current journal evidence. */
export function discoverAccountMatcherProposals(
  input: DiscoverAccountMatcherProposalsInput,
): AccountMatcherDiscoveryResult {
  const allEvidence = dedupeMessages(input.evidence);
  const evidenceIds = new Set(allEvidence.map(message => message.id));
  const comparisonMessages = dedupeMessages([
    ...allEvidence,
    ...(input.comparisonMessages ?? []).filter(message => !evidenceIds.has(message.id)),
  ]);
  const targetEvidence = allEvidence.filter(message =>
    message.linkedAccountIds.includes(input.accountId),
  );
  // A saved matcher represents an intentional configuration even when disabled.
  // Enabled state controls live recognition, not whether its covered history needs rediscovery.
  const configuredMatchers = input.matchers
    .filter(matcher => matcher.accountId === input.accountId)
    .map(matcher => {
      const definition = matcherDefinition(matcher);
      return {
        definition,
        conditionsKey: definition ? conditionsKeyFor(definition) : matcher.conditionsKey,
      };
    });
  const configuredKeys = new Set(configuredMatchers.map(matcher => matcher.conditionsKey));
  const uncoveredIds = new Set(
    targetEvidence
      .filter(
        message =>
          !configuredMatchers.some(
            ({ definition }) => definition && messageMatches(input.accountId, definition, message),
          ),
      )
      .map(message => message.id),
  );

  const grouped = new Map<
    string,
    {
      sender: string;
      structure: string;
      entries: { message: AccountMatcherDiscoveryMessage; tokens: TokenEvidence[] }[];
    }
  >();
  for (const message of targetEvidence) {
    const normalizedSender = normalizeSenderHeader(message.senderAddress ?? '');
    const tokens = tokensFor(message);
    if (!tokens) continue;
    if (!normalizedSender && tokens.length === 0) continue;
    const structure = message.rawBody ? structureKey(tokens) : '<sender-only>';
    const key = JSON.stringify([normalizedSender, structure]);
    const group = grouped.get(key) ?? { sender: normalizedSender, structure, entries: [] };
    group.entries.push({ message, tokens });
    grouped.set(key, group);
  }

  const candidates = new Map<string, AccountMatcherProposal>();
  for (const group of grouped.values()) {
    const hasBodyText = group.entries.some(({ message }) => Boolean(message.rawBody));
    const fragments = hasBodyText ? fragmentsFor(group.entries) : [];
    const definition = definitionFor(group.sender, fragments);
    if ((hasBodyText && !fragments.length) || (!definition.sender && !fragments.length)) continue;
    const conditionsKey = conditionsKeyFor(definition);
    const examples = group.entries
      .filter(({ message }) => messageMatches(input.accountId, definition, message))
      .map(({ message }) => ({ message, provenance: provenanceFor(message) }));
    const distinctSms = dedupeMessages(examples.map(example => example.message));
    const supportJournalIds = [
      ...new Set(
        distinctSms.flatMap(message => (message.linkedJournalId ? [message.linkedJournalId] : [])),
      ),
    ];
    if (distinctSms.length < 2 || supportJournalIds.length < 2) continue;
    if (!distinctSms.some(message => uncoveredIds.has(message.id))) continue;

    const hasAmbiguousJournal = distinctSms.some(
      message => new Set(message.linkedAccountIds).size > 1,
    );
    const hasFixedAccountReference = distinctSms.some(message =>
      hasAccountReference(message, fragments),
    );
    if (hasAmbiguousJournal && !hasFixedAccountReference) continue;

    if (configuredKeys.has(conditionsKey)) continue;

    const candidate: AccountMatcherProposal = {
      proposalKey: conditionsKey,
      accountId: input.accountId,
      definition,
      examples: distinctSms.map(message => ({ message, provenance: provenanceFor(message) })),
      supportJournalIds,
      overlaps: proposalOverlaps(input.accountId, definition, comparisonMessages),
      allExamplesAutoPosted: distinctSms.every(
        message => message.processingStatus === InboxProcessingStatus.AUTO_POSTED,
      ),
    };
    const previous = candidates.get(conditionsKey);
    if (!previous) candidates.set(conditionsKey, candidate);
    else {
      const merged = dedupeMessages([
        ...previous.examples.map(example => example.message),
        ...candidate.examples.map(example => example.message),
      ]);
      const mergedJournals = [
        ...new Set(
          merged.flatMap(message => (message.linkedJournalId ? [message.linkedJournalId] : [])),
        ),
      ];
      if (merged.length >= 2 && mergedJournals.length >= 2) {
        candidates.set(conditionsKey, {
          ...previous,
          examples: merged.map(message => ({ message, provenance: provenanceFor(message) })),
          supportJournalIds: mergedJournals,
          overlaps: proposalOverlaps(input.accountId, definition, comparisonMessages),
          allExamplesAutoPosted: merged.every(
            message => message.processingStatus === InboxProcessingStatus.AUTO_POSTED,
          ),
        });
      }
    }
  }

  const suppressionByKey = new Map(
    (input.suppressions ?? [])
      .filter(suppression => suppression.accountId === input.accountId)
      .map(suppression => [suppression.conditionsKey, suppression]),
  );
  const proposals: AccountMatcherProposal[] = [];
  const suppressedProposals: SuppressedAccountMatcherProposal[] = [];
  for (const candidate of candidates.values()) {
    const suppression = suppressionByKey.get(candidate.proposalKey);
    if (suppression) suppressedProposals.push({ ...candidate, suppression });
    else proposals.push(candidate);
  }
  return { proposals, suppressedProposals };
}
