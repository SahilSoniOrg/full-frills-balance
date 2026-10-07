import { findSmsHighlightRanges, splitSmsByHighlights } from '../smsHighlightRanges';

describe('SMS extraction highlights', () => {
  it.each(['Rs.52', 'Rs 52.00', 'INR 52', '₹52.00', '$52.00'])(
    'matches %s by numeric value',
    token => {
      const body = `${token} debited from A/c XX4821`;
      expect(findSmsHighlightRanges(body, { amount: 52 })).toEqual([
        { start: 0, end: token.length, kind: 'amount' },
      ]);
    },
  );
  it.each(['Rs.1,234.50', 'INR 1,23,456.78'])('matches grouped amount %s', token => {
    const value = token.includes('456') ? 123456.78 : 1234.5;
    expect(findSmsHighlightRanges(token, { amount: value })).toHaveLength(1);
  });
  it('keeps ranges sorted and non-overlapping when an identifier equals the amount', () => {
    const body = 'Ref 52, INR 52 paid to SHOP from XX52';
    const ranges = findSmsHighlightRanges(body, {
      amount: 52,
      reference: '52',
      merchant: 'shop',
      accountHint: 'XX52',
    });
    for (let i = 1; i < ranges.length; i++)
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
    expect(ranges.some(range => range.kind === 'merchant')).toBe(true);
    expect(ranges[0].kind).toBe('reference');
  });
  it('does not guess absent values, date fragments, or account suffixes', () => {
    expect(
      findSmsHighlightRanges('A/c XX52, on 52-10-26 at 10:52 Ref ABC52', {
        amount: 52,
        merchant: 'Other',
      }),
    ).toEqual([]);
    expect(findSmsHighlightRanges('INR 520', { amount: 52 })).toEqual([]);
  });
  it('allows sentence punctuation after a complete amount', () => {
    expect(findSmsHighlightRanges('Paid INR 52.00.', { amount: 52 })).toEqual([
      { start: 5, end: 14, kind: 'amount' },
    ]);
  });
  it('matches account hints and references exactly, merchant without case sensitivity', () => {
    const body = 'XX4821 to SHOP Ref ABC';
    const ranges = findSmsHighlightRanges(body, {
      accountHint: 'xx4821',
      reference: 'abc',
      merchant: 'shop',
    });
    expect(ranges).toEqual([{ start: 10, end: 14, kind: 'merchant' }]);
  });
  it('splits a body into plain and highlighted pieces that rejoin to the original', () => {
    const body = 'Paid INR 52 to SHOP.';
    const chunks = splitSmsByHighlights(
      body,
      findSmsHighlightRanges(body, { amount: 52, merchant: 'shop' }),
    );
    expect(chunks).toEqual([
      { text: 'Paid ' },
      { text: 'INR 52', kind: 'amount' },
      { text: ' to ' },
      { text: 'SHOP', kind: 'merchant' },
      { text: '.' },
    ]);
    expect(chunks.map(chunk => chunk.text).join('')).toBe(body);
  });
});
