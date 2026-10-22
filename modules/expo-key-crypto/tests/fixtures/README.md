# Public protocol fixtures

`row-vectors.json` contains synthetic version-1 row envelopes with explicit
`enc: "shortkey1"` and `compression: "gzip"`. The compression field is authenticated
in header TLV tag 11. Inner TLV version 0x04 carries schema version and body.
The manifest and key envelope formats are versioned independently.

Regenerate deliberately with `node scripts/sync/generate-row-vectors.mjs`.
The independent Node stdlib oracle creates actual gzip members, fixed-key
ciphertexts, AAD, Merkle roots and signed manifest bytes. C++/WASM codec checks
read these members with the bounded native gzip decoder, including empty output,
64 KiB output, overflow, corruption, truncation and trailing-member rejection.
Compression byte equality between different zlib versions is not required.

`gzipBackup.test.ts` constructs a signed gzip archive and round-trips it through
the parser and native engine. Generic native record tests exercise nonfinancial
names and the 128-byte UTF-8 identifier boundary.
