import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const relative = path.relative(root, filename).split(path.sep).join('/');
      if (
        relative.includes('/__tests__/') ||
        relative.startsWith('src/testing/keyCryptoReference/')
      )
        continue;
      const source = fs.readFileSync(filename, 'utf8');
      if (/from\s+['"][^'"]*keyCryptoReference\//.test(source))
        violations.push(`${relative}: production import of JS crypto test oracle`);
      if (
        relative.startsWith('src/services/backup/') &&
        /withWorkplaceKey|openRecoveryEnvelope|openKeyEnvelope|generateEncryptionPair|generateUserSigningPair|\.vault\.load\(/.test(
          source,
        )
      )
        violations.push(`${relative}: secret-bearing JS key operation`);
    }
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'app'));
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else
  console.log('Native key boundary OK: no production JS key operations or test-oracle imports.');
