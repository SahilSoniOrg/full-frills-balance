import {
    sanitizeAmount,
    sanitizeInput,
    validateAccountName,
    validateCurrencyCode,
    validateDescription
} from '@/src/utils/validation';

describe('validation', () => {
    describe('sanitizeInput', () => {
        it('should trim and collapse spaces', () => {
            expect(sanitizeInput('  hello   world  ')).toBe('hello world');
        });

        it('should remove HTML-like tags', () => {
            expect(sanitizeInput('hello <script>alert(1)</script> world')).toBe('hello scriptalert(1)/script world');
        });
    });

    describe('validateAccountName', () => {
        it('should validate valid names', () => {
            expect(validateAccountName('Checking Account').isValid).toBe(true);
            expect(validateAccountName('Cash-123 & Co.').isValid).toBe(true);
        });

        it('should reject empty or short names', () => {
            expect(validateAccountName('').isValid).toBe(false);
            expect(validateAccountName(' ').isValid).toBe(false);
            expect(validateAccountName('A').isValid).toBe(false);
        });

        it('should reject too long names', () => {
            expect(validateAccountName('A'.repeat(101)).isValid).toBe(false);
        });

        it('should reject invalid characters', () => {
            expect(validateAccountName('Account @#$%').isValid).toBe(false);
        });
    });

    describe('validateCurrencyCode', () => {
        it('should validate valid codes', () => {
            expect(validateCurrencyCode('USD').isValid).toBe(true);
            expect(validateCurrencyCode('eur').isValid).toBe(true); // Case-insensitive sanitization
        });

        it('should reject invalid codes', () => {
            expect(validateCurrencyCode('US').isValid).toBe(false);
            expect(validateCurrencyCode('USDT').isValid).toBe(false);
            expect(validateCurrencyCode('123').isValid).toBe(false);
            expect(validateCurrencyCode('U$D').isValid).toBe(false);
        });
    });

    describe('validateDescription', () => {
        it('should validate valid descriptions', () => {
            expect(validateDescription('Lunch with friends').isValid).toBe(true);
            expect(validateDescription('').isValid).toBe(true); // Optional
        });

        it('should reject too long descriptions', () => {
            expect(validateDescription('A'.repeat(501)).isValid).toBe(false);
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
