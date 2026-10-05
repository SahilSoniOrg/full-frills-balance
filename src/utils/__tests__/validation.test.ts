import { sanitizeAmount, sanitizeInput } from '@/src/utils/validation';

describe('validation', () => {
  describe('sanitizeInput', () => {
    it('should trim and collapse spaces', () => {
      expect(sanitizeInput('  hello   world  ')).toBe('hello world');
    });

    it('should remove HTML-like tags', () => {
      expect(sanitizeInput('hello <script>alert(1)</script> world')).toBe(
        'hello scriptalert(1)/script world',
      );
    });
  });

  describe('sanitizeAmount', () => {
    it('should parse strings to numbers', () => {
      expect(sanitizeAmount('123.45')).toBe(123.45);
      expect(sanitizeAmount('$1,234.56')).toBe(1234.56);
    });

    it('should handle numeric input', () => {
      expect(sanitizeAmount(123.456, 2)).toBe(123.46);
    });

    it('should return null for invalid input', () => {
      expect(sanitizeAmount('abc')).toBe(null);
      expect(sanitizeAmount('')).toBe(null);
      expect(sanitizeAmount(Infinity)).toBe(null);
    });
  });
});
