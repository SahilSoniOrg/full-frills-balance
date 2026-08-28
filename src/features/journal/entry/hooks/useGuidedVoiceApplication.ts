import type { useJournalEditor } from './useJournalEditor';
import type { useSimpleJournalEditor } from './useSimpleJournalEditor';
import type { VoiceJournalApplyParams } from './useVoiceJournalParse';

export function useGuidedVoiceApplication(
  editor: ReturnType<typeof useJournalEditor>,
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>,
) {
  return (params: VoiceJournalApplyParams) => {
    if (params.merchantName) editor.setDescription(params.merchantName);
    if (params.transcription) editor.setNotes(`Spoken transcript: ${params.transcription}`);

    const mappedType =
      params.transactionType || (params.direction === 'credit' ? 'income' : 'expense');
    simpleEditor.setType(mappedType);
    if (params.amount) simpleEditor.setAmount(String(params.amount));

    if (mappedType === 'income') {
      if (params.categoryAccountId) simpleEditor.setSourceId(params.categoryAccountId);
      if (params.sourceAccountId) simpleEditor.setDestinationId(params.sourceAccountId);
    } else {
      if (params.sourceAccountId) simpleEditor.setSourceId(params.sourceAccountId);
      if (params.categoryAccountId) simpleEditor.setDestinationId(params.categoryAccountId);
    }
  };
}
