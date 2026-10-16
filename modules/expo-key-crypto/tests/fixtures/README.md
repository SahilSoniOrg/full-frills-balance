# Public compatibility fixtures

`public-pre-refactor-backup.zip` and `public-pre-refactor-recovery.json` are
**public, synthetic, test-only data and credentials**. Never use their identity,
keys, or recovery phrase for real data. The archive contains only the Workplace
metadata `PUBLIC SYNTHETIC TEST ONLY` (USD, precision 2, 60 days), with no accounts,
journals, transactions, or real financial information.

Captured on 2026-10-16 from the unmodified C++ engine at
`88ac048e33192e42a6b69d509eaceccf39ceee2c`, before the boundary refactor, using
HPKE-capable OpenSSL at `/tmp/pr86-openssl`. A separate copy of that engine was
compiled before core edits for the reverse interoperability check. The existing
`row-vectors.json` was retained byte-for-byte.

Fixed SHA-256 values:

- Archive: `3472737b158cb7396a6b6b4a15108a6497822c7296fb79f62daccde4312174a2`
- Recovery: `83a5d43e81b16b19c8bd87ed649636b328b7ff08b64b168d0154fc2dd0fee45d`

`cryptoCompatibility.test.ts` normally reads these files; it does not regenerate
them. Its opt-in capture case is for deliberate fixture maintenance against a
saved original host, not for updating expectations after a refactor.
`FFB_COMPATIBILITY_OUTPUT` writes newly encrypted rows and a signed manifest;
`FFB_COMPATIBILITY_INPUT` checks those rows and reproduces the signature with an
independently compiled reader. Ciphertext equality is never expected.

The pre-refactor native suite passed 58 tests. Its baseline rejected unknown
financial table names, cross-table/unknown dictionaries, duplicate rows, tampered
headers/salts/ciphertexts, wrong Workplace identity, >64 KiB plaintext, >68 KiB
ciphertext, >500 rows, and >4 MiB batch data. The refactor deliberately moves the
financial allowlist to app validation; native crypto still rejects malformed or
>128-byte types and missing/mismatched trusted dictionary descriptors.

`TestRowDictionaries.cpp` supplies a separate host-test provider with the opaque
record type `weather.observation` and unrelated ID `opaque-test-dictionary-7`.
Android, iOS and shipped WASM continue compiling only the generated production
provider; there is no runtime registration API.

The host test provider also binds ASCII and multibyte boundary record types at
64, 65, 127 and 128 UTF-8 bytes to its public test dictionary. Native tests round-trip
these through the TypeScript bridge and compression/encryption, preserve long
identifiers in error results, and directly reject 129-byte requests/envelopes.
Shared codec checks exercise the same limits in the native host and rebuilt WASM.
These boundary bindings are not part of the production dictionary provider.
