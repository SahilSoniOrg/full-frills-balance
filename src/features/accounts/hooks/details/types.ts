import type { IconName } from '@/src/components/core';
import type { AccountMatcherOverlap } from '@/src/features/accounts/helpers/buildMatcherPreviewModel';
import type {
  AccountMatcherDefinitionV1,
  AccountMatcherFlow,
  AccountMatcherMatches,
  AccountMatcherPreviewMessage,
  AccountMatcherProposal,
  AccountMatcherSnapshot,
  SmsRecognitionSummary,
  SuppressedAccountMatcherProposal,
  TextSpan,
} from '@/src/types/accountMatcher';
import type { AccountId } from '@/src/types/ids';
import type { SmsTextSpan } from '@/src/services/journal/smsTextSpans';
import type { SafeRegexValidation } from '@/src/services/sms/recognition/safeAccountMatcherRegex';

export interface PeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  dailyAverage: number | null;
  isLoading: boolean;
}

export interface PreviousPeriodMetrics {
  label: string;
  netChange: number;
}

export interface SubAccountViewModel {
  id: AccountId;
  name: string;
  accountType: string;
  icon: IconName;
  balanceAmount: number;
  currencyCode: string;
  categoryColor: string;
  accountColor: string;
  level: number;
  isGroup: boolean;
}

export interface AncestorAccountViewModel {
  id: AccountId;
  name: string;
  isArchived: boolean;
}

export interface AccountMatcherManagementViewModel {
  proposals: AccountMatcherProposal[];
  suppressedProposals: SuppressedAccountMatcherProposal[];
  byMatcherId: ReadonlyMap<string, AccountMatcherMatches>;
  inspectedCount: number;
  inspectedDates: { start: number; end: number } | null;
  recognitions: SmsRecognitionSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  dismiss: (conditionsKey: string) => void;
  restore: (conditionsKey: string) => void;
}

export interface AccountMatchersSectionModel {
  matchers: readonly AccountMatcherSnapshot[];
  management: AccountMatcherManagementViewModel;
  proposals: AccountMatcherProposal[];
  visibleProposals: AccountMatcherProposal[];
  initialSuggestions: number;
  actionProposal: AccountMatcherProposal | null;
  setActionProposal: (proposal: AccountMatcherProposal | null) => void;
  showAll: boolean;
  setShowAll: (value: boolean | ((previous: boolean) => boolean)) => void;
  showDismissed: boolean;
  setShowDismissed: (value: boolean | ((previous: boolean) => boolean)) => void;
  hideProposalForVisit: (proposalKey: string) => void;
  changeEnabled: (matcherId: string, isEnabled: boolean) => Promise<void>;
  toggleError: boolean;
}

export interface AccountMatcherEditorViewModel {
  accountId: AccountId;
  matcherId?: string;
  proposalKey?: string;
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  saveError: string | null;
  privateMode: boolean;
  accountName: string;
  isEligible: boolean;
  sender: string;
  setSender: (value: string) => void;
  flow: AccountMatcherFlow | 'either';
  setFlow: (value: AccountMatcherFlow | 'either') => void;
  fragmentsText: string;
  regexMode: boolean;
  setRegexMode: (value: boolean) => void;
  regexPattern: string;
  changeRegexPattern: (value: string) => void;
  regexValidation: SafeRegexValidation;
  setFragmentsText: (value: string) => void;
  fragments: string[];
  definition: AccountMatcherDefinitionV1;
  draftFingerprint: string;
  validation: { valid: boolean; error?: string; definition?: AccountMatcherDefinitionV1 };
  isValid: boolean;
  messages: AccountMatcherPreviewMessage[];
  olderMessages: AccountMatcherPreviewMessage[];
  olderMessagesLoaded: boolean;
  hasMoreOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  olderMessagesError: string | null;
  loadOlderMessages: () => void;
  selectedExample: AccountMatcherPreviewMessage | null;
  selectedSpans: SmsTextSpan[];
  selectedPreviewSpans: TextSpan[];
  selectMessage: (message: AccountMatcherPreviewMessage) => void;
  changeSelectedSpans: (spans: SmsTextSpan[]) => void;
  supportingExamples: { message: AccountMatcherPreviewMessage; spans: TextSpan[] }[];
  allSupportingExamplesAutoPosted: boolean;
  linkedMisses: AccountMatcherPreviewMessage[];
  overlaps: AccountMatcherOverlap[];
  existingMatcher: AccountMatcherSnapshot | null;
  proposal: AccountMatcherProposal | null;
  existingCoverage: number;
  draftCoverage: number;
  inspectedCount: number;
  inspectedDates: { start: number; end: number } | null;
  save: (resolution?: {
    keepBoth?: boolean;
    moveMatcherId?: string;
  }) => Promise<'saved' | 'invalid' | 'overlap' | 'error'>;
  forget: () => Promise<boolean>;
}
