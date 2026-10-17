import { cryptoImportViolations, nativeCryptoProfileViolations } from './lib/crypto-boundary.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
const WORKER_ONLY_MARKERS = ['ffb-key-crypto-device-vault-v1', 'ffb-key-crypto-wrap-key-v1'];
const WEB_WORKER_ROOT = 'modules/expo-key-crypto/web/';
const ALLOWED_WEB_WORKER_IMPORTERS = new Set([
  `${WEB_WORKER_ROOT}keyCryptoWorker.ts`,
  'src/services/backup/keyCrypto.worker.web.ts',
]);
const ALLOWED_WORKER_CLIENT_IMPORTERS = new Set([
  'src/services/backup/nativeKeyOperations.web.ts',
  'src/services/backup/keyCryptoWorkerClient.web.ts',
  'src/services/backup/webKeyCryptoCapability.web.ts',
]);
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const relative = path.relative(root, filename).split(path.sep).join('/');
      if (relative.includes('/__tests__/')) continue;
      const source = fs.readFileSync(filename, 'utf8');
      violations.push(...cryptoImportViolations(source, relative));
      if (
        /(?:from\s+|import\s*(?:\(|)|require\s*\()['"][^'"]*(?:keyCryptoReference\/|expo-key-crypto\/tests\/)/.test(
          source,
        )
      )
        violations.push(`${relative}: production import of native crypto test support`);
      if (
        !relative.startsWith('src/testing/') &&
        relative !== 'src/services/backup/nativeKeyOperations.native.ts' &&
        /nativeKeyOperations\.(?:importCredential|writeCredential)\(/.test(source)
      )
        violations.push(`${relative}: fixture credential-file API in production flow`);
      if (
        relative.startsWith('src/services/backup/') &&
        /withWorkplaceKey|openRecoveryEnvelope|openKeyEnvelope|generateEncryptionPair|generateUserSigningPair|\.vault\.load\(/.test(
          source,
        )
      )
        violations.push(`${relative}: secret-bearing JS key operation`);
      for (const marker of WORKER_ONLY_MARKERS) {
        if (!relative.startsWith(WEB_WORKER_ROOT) && source.includes(marker))
          violations.push(
            `${relative}: worker vault marker must not appear outside ${WEB_WORKER_ROOT}`,
          );
      }
      if (
        /from\s+['"][^'"]*expo-key-crypto\/web\/webVault['"]/.test(source) &&
        !ALLOWED_WEB_WORKER_IMPORTERS.has(relative)
      )
        violations.push(`${relative}: main thread must not import webVault`);
      if (
        /from\s+['"][^'"]*expo-key-crypto\/web\/keyCryptoWorker['"]/.test(source) &&
        !ALLOWED_WEB_WORKER_IMPORTERS.has(relative)
      )
        violations.push(`${relative}: main thread must not import keyCryptoWorker`);
      if (
        /from\s+['"][^'"]*keyCrypto\.worker\.web['"]/.test(source) &&
        relative !== 'src/services/backup/keyCrypto.worker.web.ts'
      )
        violations.push(`${relative}: worker entry must not be imported on the main thread`);
      if (
        /from\s+['"][^'"]*keyCryptoWorkerClient\.web['"]/.test(source) &&
        !ALLOWED_WORKER_CLIENT_IMPORTERS.has(relative)
      )
        violations.push(
          `${relative}: only nativeKeyOperations.web may use the key crypto worker client`,
        );
    }
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));
const financialTypes = Object.keys(
  JSON.parse(fs.readFileSync(path.join(root, 'src/services/sync/shortKeys/schema35.json'), 'utf8')),
);
for (const name of ['RowCodec.cpp', 'RowCodec.hpp', 'RowCrypto.cpp', 'RowCrypto.hpp']) {
  const relative = `modules/expo-key-crypto/cpp/${name}`;
  violations.push(
    ...nativeCryptoProfileViolations(
      fs.readFileSync(path.join(root, relative), 'utf8'),
      relative,
      financialTypes,
    ),
  );
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else
  console.log('Native key boundary OK: no production JS key operations or test-oracle imports.');
