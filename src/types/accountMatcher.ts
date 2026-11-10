import type { AccountId, JournalId } from '@/src/types/ids';
import type { AccountMatcherSuppression } from '@/src/services/preferences/workplaceTypes';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import type { AccountMatcherFlow, TextSpan } from '@/src/types/smsRecognition';

export type {
  AccountMatcherFlow,
  MatcherOutcome,
  RecognizedAccountFlow,
  SmsAccountRecognition,
  SmsRecognitionSummary,
  TextSpan,
} from '@/src/types/smsRecognition';

export interface AccountMatcherDefinitionV1 {
  version: 1;
  sender?: { op: 'contains'; value: string };
  body?: { kind: 'fragments'; fragments: string[] } | { kind: 'regex'; pattern: string };
  /** Omitted means Either: recognize the Account without asserting its transfer role. */
  flow?: AccountMatcherFlow;
}

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
  /** Eligible leaf asset/liability Accounts, used to resolve declared flow roles. */
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

/** Account membership is derived from current, non-deleted journal transactions. */
export interface AccountMatcherDiscoveryMessage extends InboxRecordSnapshot {
  linkedAccountIds: AccountId[];
  linkedAccountNames?: string[];
  contentDigest?: string;
}

/** Hydrated inbox SMS used by matcher editor and management previews. */
export interface AccountMatcherPreviewMessage extends InboxRecordSnapshot {
  linkedAccountIds: AccountId[];
  linkedAccountNames: string[];
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

export interface AccountMatcherLinkedJournal {
  id: JournalId;
  description?: string;
  journalDate: number;
}

export interface AccountMatcherMatchedMessage {
  message: AccountMatcherPreviewMessage;
  spans: TextSpan[];
  journal?: AccountMatcherLinkedJournal;
}

export interface AccountMatcherMatches {
  messages: AccountMatcherMatchedMessage[];
  journals: AccountMatcherLinkedJournal[];
  indeterminateCount: number;
}
