import type { AccountId } from '@/src/types/ids';

/** Money movement relative to the matched Account, independent of the SMS parser's direction. */
export type AccountMatcherFlow = 'incoming' | 'outgoing';

export interface AccountMatcherDefinitionV1 {
  version: 1;
  sender?: { op: 'contains'; value: string };
  body?: { kind: 'fragments'; fragments: string[] } | { kind: 'regex'; pattern: string };
  /** Omitted means Either: recognize the Account without asserting its transfer role. */
  flow?: AccountMatcherFlow;
}

export interface RecognizedAccountFlow {
  accountId: AccountId;
  flow: AccountMatcherFlow;
}

export type TextSpan = { start: number; end: number };
export type MatcherOutcome =
  | {
      status: 'match';
      matcherId: string;
      accountId: AccountId;
      spans: TextSpan[];
      flow?: AccountMatcherFlow;
    }
  | { status: 'no_match'; matcherId: string; accountId: AccountId }
  | {
      status: 'indeterminate';
      matcherId: string;
      accountId: AccountId;
      reason: 'invalid_definition' | 'regex_budget';
    };
export interface SmsAccountRecognition {
  status: 'none' | 'recognized' | 'indeterminate';
  accountIds: AccountId[];
  outcomes: MatcherOutcome[];
  flows?: RecognizedAccountFlow[];
}
/** Compact review-state form. Never persist matcher conditions or message spans here. */
export interface SmsRecognitionSummary {
  status: SmsAccountRecognition['status'];
  accountIds: AccountId[];
  matcherIds: string[];
  flows?: RecognizedAccountFlow[];
  hold?: 'contradictory' | 'indeterminate';
}
export type RuleCompatibility = 'no_recognition' | 'compatible' | 'contradictory' | 'indeterminate';
export interface AccountMatcherRecord {
  id: string;
  accountId: AccountId;
  definition: AccountMatcherDefinitionV1 | null;
  isEnabled: boolean;
  eligible: boolean;
}
export interface CompiledAccountMatcherRegexToken {
  atom: RegExp;
  min: number;
  max: number;
}
export interface CompiledAccountMatcherRegex {
  tokens: readonly CompiledAccountMatcherRegexToken[];
  startAnchored: boolean;
  endAnchored: boolean;
}
export type CompiledAccountMatcherBody =
  | { kind: 'fragments'; fragments: readonly string[] }
  | { kind: 'regex'; regex: CompiledAccountMatcherRegex }
  | null;
/** Validated matcher, including a regex compiled once for every later message. */
export type CompiledAccountMatcher =
  | { id: string; accountId: AccountId; status: 'invalid' }
  | {
      id: string;
      accountId: AccountId;
      status: 'ready';
      sender: string | null;
      body: CompiledAccountMatcherBody;
      flow?: AccountMatcherFlow;
    };
export interface AccountMatcherContext {
  matchers: readonly (AccountMatcherRecord & { compiled: CompiledAccountMatcher })[];
  /** Eligible leaf asset/liability Accounts, used to check transfer rule compatibility. */
  eligibleAccountIds?: readonly AccountId[];
}
export interface MatcherMessage {
  senderAddress: string;
  rawBody: string;
}

/** Immutable persistence snapshot used by account matcher screens. */
export interface AccountMatcherSnapshot {
  readonly id: string;
  readonly accountId: AccountId;
  readonly definitionJson: string;
  readonly conditionsKey: string;
  readonly isEnabled: boolean;
}
