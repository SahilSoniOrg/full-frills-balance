import { analytics } from '@/src/services/analytics';
import type { ParserOutput } from '@/src/services/transaction-ingestion';
import { ingestTransaction } from '@/src/services/transaction-ingestion';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

export type VoiceJournalApplyParams = {
  amount?: number;
  merchantName?: string;
  direction: 'debit' | 'credit' | 'unknown';
  transactionType?: 'expense' | 'income' | 'transfer';
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  transcription: string;
};

export type UseVoiceJournalParseArgs = {
  workplaceId: WorkplaceId;
  visible: boolean;
  onApply: (params: VoiceJournalApplyParams) => void;
  onClose: () => void;
  /** Called on volumechange for visualizer chrome (optional). */
  onVolumeChange?: (volume: number) => void;
};

type VoiceParseState =
  | { kind: 'idle' }
  | { kind: 'parsing'; session: object; text: string }
  | { kind: 'settled'; session: object; text: string; output: ParserOutput | null };

/**
 * Speech + ingest orchestration for voice journal entry.
 * Presentation (modal chrome / visualizer) stays in VoiceInputModal.
 */
export function useVoiceJournalParse({
  workplaceId,
  visible,
  onApply,
  onClose,
  onVolumeChange,
}: UseVoiceJournalParseArgs) {
  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [parseState, setParseState] = useState<VoiceParseState>({ kind: 'idle' });
  // A reopened modal is a new session, including the first render before effects run.
  const session = useMemo(() => ({ workplaceId, visible }), [workplaceId, visible]);
  const parseSequence = useRef(0);
  // Transcript updates do not cancel work: only output matching the current text is usable.
  const isCurrentParse =
    visible &&
    parseState.kind !== 'idle' &&
    parseState.session === session &&
    parseState.text === transcription.trim();
  const isParsing = isCurrentParse && parseState.kind === 'parsing';
  const parserOutput = isCurrentParse && parseState.kind === 'settled' ? parseState.output : null;

  useSpeechRecognitionEvent('start', () => setIsRecording(true));
  useSpeechRecognitionEvent('end', () => setIsRecording(false));
  useSpeechRecognitionEvent('result', event => {
    const text = event.results[0]?.transcript || '';
    setTranscription(text);
  });
  useSpeechRecognitionEvent('error', event => {
    logger.error('[useVoiceJournalParse] Speech recognition error', event.error);
    analytics.trackFeatureUsage('voice_journal', 'speech_error', {
      error: String(event.error || 'unknown'),
    });
    setIsRecording(false);
  });
  useSpeechRecognitionEvent('volumechange', event => {
    onVolumeChange?.(event.value);
  });

  useEffect(() => {
    // Closing, reopening, switching books and unmounting revoke pending results.
    parseSequence.current += 1;
    if (!visible) return;
    const timer = setTimeout(() => {
      setTranscription('');
      setIsRecording(false);
      setParseState({ kind: 'idle' });
    }, 0);
    return () => {
      parseSequence.current += 1;
      clearTimeout(timer);
    };
  }, [visible, workplaceId, setTranscription]);

  const startRecording = useCallback(async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      logger.warn('[useVoiceJournalParse] Speech permissions denied');
      analytics.trackFeatureUsage('voice_journal', 'permission_denied');
      return;
    }

    setTranscription('');
    analytics.trackFeatureUsage('voice_journal', 'record_started');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN',
      interimResults: true,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 50,
      },
    });
  }, [setTranscription]);

  const stopRecording = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const parseTranscription = useCallback(
    async (textToParse: string) => {
      const text = textToParse.trim();
      if (!visible || !text) return;
      const request = ++parseSequence.current;
      setParseState({ kind: 'parsing', session, text });
      Keyboard.dismiss();

      try {
        const output = await ingestTransaction(textToParse, workplaceId);
        if (request !== parseSequence.current) return;
        setParseState({ kind: 'settled', session, text, output });
        analytics.trackFeatureUsage('voice_journal', 'parsed', {
          success: !!output && output.transactions.length > 0,
          transaction_count: output?.transactions?.length || 0,
          is_ai: false,
        });
      } catch (err) {
        if (request !== parseSequence.current) return;
        logger.error('[useVoiceJournalParse] Extraction failed', err);
        analytics.trackFeatureUsage('voice_journal', 'parse_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        setParseState({ kind: 'settled', session, text, output: null });
      }
    },
    [visible, workplaceId, session],
  );

  const selectTemplate = useCallback(
    (template: string) => {
      setTranscription(template);
      analytics.trackFeatureUsage('voice_journal', 'template_selected', {
        template_length: template.length,
      });
      void parseTranscription(template);
    },
    [parseTranscription, setTranscription],
  );

  const applyParsedResult = useCallback(() => {
    if (!parserOutput || parserOutput.transactions.length === 0) return;
    const result = parserOutput.transactions[0];

    analytics.trackFeatureUsage('voice_journal', 'applied', {
      has_amount: result.amount !== undefined,
      has_merchant: !!(result.categoryNameHint || result.description),
      transaction_type: result.type,
      direction: result.type === 'income' ? 'credit' : 'debit',
    });

    onApply({
      amount: result.amount,
      merchantName: result.categoryNameHint || result.description,
      direction: result.type === 'income' ? 'credit' : 'debit',
      transactionType:
        result.type === 'unknown' ? undefined : (result.type as 'expense' | 'income' | 'transfer'),
      sourceAccountId: (result.accountId as AccountId) || EMPTY_ACCOUNT_ID,
      categoryAccountId: (result.categoryId as AccountId) || EMPTY_ACCOUNT_ID,
      transcription: transcription.trim(),
    });
    onClose();
  }, [parserOutput, transcription, onApply, onClose]);

  return {
    transcription,
    setTranscription,
    isRecording,
    isParsing,
    parserOutput,
    startRecording,
    stopRecording,
    parseTranscription,
    selectTemplate,
    applyParsedResult,
  };
}
