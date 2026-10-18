import {
  canonicalJson,
  canonicalJsonBytes,
  contentHash,
  parseCanonicalJson,
} from '../canonicalJson';

describe('canonical JSON trust boundary', () => {
  test('sorts recursively, including numeric-looking keys, and preserves array order', async () => {
    const left = { z: [{ b: 2, a: 1 }, 'चाय ☕'], a: { '2': 2, '10': 10 }, zero: -0 };
    const right = { zero: 0, a: { '10': 10, '2': 2 }, z: [{ a: 1, b: 2 }, 'चाय ☕'] };
    expect(canonicalJson(left)).toBe('{"a":{"10":10,"2":2},"z":[{"a":1,"b":2},"चाय ☕"],"zero":0}');
    expect(canonicalJsonBytes(left)).toEqual(canonicalJsonBytes(right));
    expect(await contentHash(left)).toBe(await contentHash(right));
    expect(await contentHash([1, 2])).not.toBe(await contentHash([2, 1]));
  });
  test('has explicit Unicode and UTF-8 behavior', () => {
    expect(Buffer.from(canonicalJsonBytes('é😀')).toString('hex')).toBe('22c3a9f09f988022');
    expect(canonicalJson('é')).not.toBe(canonicalJson('e\u0301'));
    expect(() => canonicalJson('\ud800')).toThrow(/surrogate/);
    expect(() => canonicalJson({ '\udc00': 1 })).toThrow(/surrogate/);
    expect(() => parseCanonicalJson(Uint8Array.of(0x22, 0xff, 0x22))).toThrow(/UTF-8/);
    expect(() => parseCanonicalJson(Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d))).toThrow();
  });
  test.each([
    NaN,
    Infinity,
    -Infinity,
    undefined,
    1n,
    Symbol('x'),
    () => 1,
    new Date(0),
    new Uint8Array(1),
    { a: undefined },
    [undefined],
    Array(1),
  ])('rejects a non-JSON input %#', value => {
    expect(() => canonicalJson(value)).toThrow();
  });
  test('rejects hidden/accessor properties without invoking them; shared subtrees are legal', () => {
    const read = jest.fn(() => 'secret');
    expect(() =>
      canonicalJson(Object.defineProperty({}, 'a', { get: read, enumerable: true })),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() => canonicalJson(Object.defineProperty({}, 'a', { value: 1 }))).toThrow();
    expect(() => canonicalJson({ [Symbol('x')]: 1 })).toThrow();
    const shared = { a: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"a":1},{"a":1}]');
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => canonicalJson(cycle)).toThrow(/Cyclic/);
    expect(canonicalJson(JSON.parse('{"__proto__":{"x":1}}'))).toBe('{"__proto__":{"x":1}}');
  });
  test.each(['{"a":1,"a":2}', '{"b":2,"a":1}', '{ "a":1 }', '{"a":1.0}', '{"a":-0}', '"\\u0061"'])(
    'rejects alternate wire spelling %s',
    text => {
      expect(() => parseCanonicalJson(new TextEncoder().encode(text))).toThrow(/Noncanonical/);
    },
  );
});

// Use real SHA-256 in Jest; production selects the platform provider.
jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));
