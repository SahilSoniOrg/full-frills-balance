import {
  fragmentsFromSmsSpans,
  mergeSelectedSmsWordSpans,
  selectedSmsWordIndexes,
  splitSmsTextBySpans,
  tokenizeSmsWords,
} from '../smsTextSpans';

describe('SMS text selection spans', () => {
  it('merges adjacent selected words and keeps source offsets', () => {
    const body = 'Your card ending with 1234 is ready';
    const tokens = tokenizeSmsWords(body);
    const spans = mergeSelectedSmsWordSpans(tokens, new Set([1, 2]));

    expect(spans).toEqual([{ start: 5, end: 16 }]);
    expect(fragmentsFromSmsSpans(body, spans)).toEqual(['card ending']);
    expect(selectedSmsWordIndexes(tokens, spans)).toEqual(new Set([1, 2]));
  });

  it('keeps disjoint phrases in message order and splits text at the original offsets', () => {
    const body = 'Bank A credited 500 to account 1234';
    const tokens = tokenizeSmsWords(body);
    const spans = mergeSelectedSmsWordSpans(tokens, new Set([5, 0]));

    expect(spans.map(span => body.slice(span.start, span.end))).toEqual(['Bank', 'account']);
    expect(splitSmsTextBySpans(body, spans)).toEqual([
      { text: 'Bank', start: 0, end: 4, highlighted: true },
      { text: ' A credited 500 to ', start: 4, end: 23, highlighted: false },
      { text: 'account', start: 23, end: 30, highlighted: true },
      { text: ' 1234', start: 30, end: 35, highlighted: false },
    ]);
  });
});
