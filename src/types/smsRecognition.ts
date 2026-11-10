import type { AccountId } from '@/src/types/ids';

/** Money movement relative to the matched Account, independent of parser direction. */
export type AccountMatcherFlow = 'incoming' | 'outgoing';

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
