import {
  assertAllowedKeys,
  assertExactKeys,
  isHexId,
  isSha256Id,
  parseObject,
} from '../strictObject';

it.each([null, undefined, [], 'object', 1, false])('rejects non-record input %p', value => {
  expect(() => parseObject(value, 'Invalid file')).toThrow('Invalid file');
});

it('keeps optional allowlists distinct from exact required fields', () => {
  const value = parseObject(JSON.parse('{"purpose":"recovery"}'), 'Invalid file');
  expect(() => assertAllowedKeys(value, ['purpose', 'deviceId'], 'Invalid fields')).not.toThrow();
  expect(() => assertExactKeys(value, ['purpose', 'deviceId'], 'Invalid fields')).toThrow();
  expect(() =>
    assertExactKeys(
      { deviceId: 'phone', purpose: 'recovery' },
      ['purpose', 'deviceId'],
      'Invalid fields',
    ),
  ).not.toThrow();
  // A replacement field must fail even when the field count is correct.
  expect(() =>
    assertExactKeys(
      { purpose: 'recovery', privateKey: 'unexpected' },
      ['purpose', 'deviceId'],
      'Invalid fields',
    ),
  ).toThrow();
  expect(() =>
    assertAllowedKeys(
      { ...value, privateKey: 'unexpected' },
      ['purpose', 'deviceId'],
      'Invalid fields',
    ),
  ).toThrow();
});

it('accepts only complete lowercase identifiers of the required length', () => {
  const digest = 'ab'.repeat(32);
  expect(isHexId(digest, 64)).toBe(true);
  expect(isSha256Id(`sha256:${digest}`)).toBe(true);
  for (const value of [null, 64, '', digest.toUpperCase(), `${digest}\n`, digest.slice(1)]) {
    expect(isHexId(value, 64)).toBe(false);
    expect(isSha256Id(`sha256:${value}`)).toBe(false);
  }
  expect(isSha256Id(digest)).toBe(false);
});
