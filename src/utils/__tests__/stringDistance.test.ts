import { getLevenshteinDistance, getStringSimilarity } from '../stringDistance';

describe('stringDistance', () => {
  describe('getLevenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(getLevenshteinDistance('hello', 'hello')).toBe(0);
      expect(getLevenshteinDistance('', '')).toBe(0);
    });

    it('calculates correct distance for insertions, deletions, and substitutions', () => {
      expect(getLevenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(getLevenshteinDistance('flaw', 'lawn')).toBe(2);
      expect(getLevenshteinDistance('gumbo', 'gambol')).toBe(2);
    });

    it('handles empty strings', () => {
      expect(getLevenshteinDistance('abc', '')).toBe(3);
      expect(getLevenshteinDistance('', 'abcd')).toBe(4);
    });
  });

  describe('getStringSimilarity', () => {
    it('returns 1.0 for identical strings regardless of case', () => {
      expect(getStringSimilarity('Starbucks', 'starbucks')).toBe(1.0);
      expect(getStringSimilarity('', '')).toBe(1.0);
    });

    it('returns proportional similarity for near matches', () => {
      const similarity = getStringSimilarity('Swiggy Order', 'Swiggy');
      expect(similarity).toBeGreaterThan(0.4);
      expect(similarity).toBeLessThan(1.0);
    });

    it('returns 0 for completely disjoint strings of same length', () => {
      expect(getStringSimilarity('abc', 'xyz')).toBe(0);
    });
  });
});
