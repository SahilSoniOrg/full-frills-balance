import { act, renderHook } from '@testing-library/react-native';
import { useVoiceJournalParse } from '../useVoiceJournalParse';
import { ingestTransaction, type ParserOutput } from '@/src/services/transaction-ingestion';
import { asWorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/transaction-ingestion', () => ({ ingestTransaction: jest.fn() }));
jest.mock('@/src/services/analytics', () => ({ analytics: { trackFeatureUsage: jest.fn() } }));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {},
  useSpeechRecognitionEvent: jest.fn((name: string, listener: typeof mockResultListener) => {
    if (name === 'result') mockResultListener = listener;
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const output: ParserOutput = {
  transactions: [{ type: 'expense', amount: 120 }],
  confidenceScore: 1,
  isHighConfidence: true,
  provider: 'deterministic',
};
const workplaceId = asWorkplaceId('voice-workplace');
let mockResultListener: (event: { results: { transcript: string }[] }) => void;

describe('useVoiceJournalParse lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it('preserves pending and completed parses when speech repeats the same transcript', async () => {
    const pending = deferred<ParserOutput>();
    jest.mocked(ingestTransaction).mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useVoiceJournalParse({
        workplaceId,
        visible: true,
        onApply: jest.fn(),
        onClose: jest.fn(),
      }),
    );
    act(() => jest.runOnlyPendingTimers());
    const event = { results: [{ transcript: '120 for tea' }] };
    act(() => mockResultListener(event));
    let parsing!: Promise<void>;
    act(() => {
      parsing = result.current.parseTranscription('120 for tea');
    });
    act(() => mockResultListener(event));
    expect(result.current.isParsing).toBe(true);
    await act(async () => {
      pending.resolve(output);
      await parsing;
    });
    act(() => mockResultListener(event));
    expect(result.current.parserOutput).toBe(output);
    expect(result.current.isParsing).toBe(false);
  });

  it('lets only the newest template publish its result or finish loading', async () => {
    const first = deferred<ParserOutput>();
    const second = deferred<ParserOutput>();
    jest
      .mocked(ingestTransaction)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useVoiceJournalParse({
        workplaceId,
        visible: true,
        onApply: jest.fn(),
        onClose: jest.fn(),
      }),
    );
    act(() => jest.runOnlyPendingTimers());
    act(() => result.current.selectTemplate('old text'));
    act(() => result.current.selectTemplate('new text'));
    await act(async () => {
      first.resolve(output);
      await first.promise;
    });
    expect(result.current.isParsing).toBe(true);
    expect(result.current.parserOutput).toBeNull();
    await act(async () => {
      second.resolve(output);
      await second.promise;
    });
    expect(result.current.isParsing).toBe(false);
    expect(result.current.parserOutput).toBe(output);
  });

  it('revokes a parsed result when its text is edited', async () => {
    jest.mocked(ingestTransaction).mockResolvedValue(output);
    const onApply = jest.fn();
    const { result } = renderHook(() =>
      useVoiceJournalParse({
        workplaceId,
        visible: true,
        onApply,
        onClose: jest.fn(),
      }),
    );
    act(() => jest.runOnlyPendingTimers());
    await act(async () => {
      result.current.selectTemplate('120 for tea');
    });
    expect(result.current.parserOutput).toBe(output);
    act(() => result.current.setTranscription('240 for tea'));
    act(() => result.current.applyParsedResult());
    expect(result.current.parserOutput).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('rejects a pending result after the modal closes and reopens', async () => {
    const pending = deferred<ParserOutput>();
    jest.mocked(ingestTransaction).mockReturnValue(pending.promise);
    const onApply = jest.fn();
    const onClose = jest.fn();
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) =>
        useVoiceJournalParse({
          workplaceId,
          visible,
          onApply,
          onClose,
        }),
      { initialProps: { visible: true } },
    );
    act(() => jest.runOnlyPendingTimers());
    act(() => result.current.selectTemplate('120 for tea'));
    rerender({ visible: false });
    rerender({ visible: true });
    await act(async () => {
      pending.resolve(output);
      await pending.promise;
    });
    expect(result.current.parserOutput).toBeNull();
    expect(result.current.isParsing).toBe(false);
    act(() => result.current.applyParsedResult());
    expect(onApply).not.toHaveBeenCalled();
  });
});
