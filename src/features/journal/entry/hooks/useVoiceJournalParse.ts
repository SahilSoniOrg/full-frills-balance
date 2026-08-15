import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { transactionIngestionService } from '@/src/services/transaction-ingestion';
import type { ParserOutput } from '@/src/services/transaction-ingestion';

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
  const [isParsing, setIsParsing] = useState(false);
  const [parserOutput, setParserOutput] = useState<ParserOutput | null>(null);

  useSpeechRecognitionEvent('start', () => setIsRecording(true));
  useSpeechRecognitionEvent('end', () => setIsRecording(false));
  useSpeechRecognitionEvent('result', event => {
    const text = event.results[0]?.transcript || '';
    setTranscription(text);
  });
  useSpeechRecognitionEvent('error', event => {
    logger.error('[useVoiceJournalParse] Speech recognition error', event.error);
    setIsRecording(false);
  });
  useSpeechRecognitionEvent('volumechange', event => {
    onVolumeChange?.(event.value);
  });

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setTranscription('');
      setIsRecording(false);
      setIsParsing(false);
      setParserOutput(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const startRecording = useCallback(async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      logger.warn('[useVoiceJournalParse] Speech permissions denied');
      return;
    }

    setParserOutput(null);
    setTranscription('');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN',
      interimResults: true,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 50,
      },
    });
  }, []);

  const stopRecording = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const parseTranscription = useCallback(
    async (textToParse: string, forceAi: boolean = false) => {
      if (!textToParse.trim()) return;
      setIsParsing(true);
      Keyboard.dismiss();

      try {
        const output = await transactionIngestionService.ingest(textToParse, workplaceId, forceAi);
        setParserOutput(output);
      } catch (err) {
        logger.error('[useVoiceJournalParse] Extraction failed', err);
        setParserOutput(null);
      } finally {
        setIsParsing(false);
      }
    },
    [workplaceId],
  );

  const selectTemplate = useCallback(
    (template: string) => {
      setTranscription(template);
      void parseTranscription(template);
    },
    [parseTranscription],
  );

  const applyParsedResult = useCallback(() => {
    if (!parserOutput || parserOutput.transactions.length === 0) return;
    const result = parserOutput.transactions[0];

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
