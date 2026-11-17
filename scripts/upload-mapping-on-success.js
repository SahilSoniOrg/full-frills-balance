// EAS build lifecycle hook: runs at the end of a successful build.
// On Android, uploads the R8 mapping file to Google Play Console.
// On iOS (or when env is missing), exits silently.

const { execFileSync } = require('child_process');
const fs = require('fs');

if (process.env.EAS_BUILD_PLATFORM !== 'android') {
  console.log('upload-mapping-on-success: not Android, skipping.');
  process.exit(0);
}

// Resolve versionCode from the generated build.gradle if not provided.
let versionCode = process.env.VERSION_CODE;
if (!versionCode) {
  try {
    const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
    const m = gradle.match(/versionCode\s+(\d+)/);
    if (m) versionCode = m[1];
  } catch {
    // ignore
  }
}

const mappingFile = 'android/app/build/outputs/mapping/release/mapping.txt';
if (!fs.existsSync(mappingFile)) {
  console.log('upload-mapping-on-success: mapping.txt not found, skipping.');
  process.exit(0);
}

if (!versionCode) {
  console.warn('upload-mapping-on-success: could not determine versionCode, skipping.');
  process.exit(0);
}

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
if (!keyPath) {
  console.warn('upload-mapping-on-success: GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set, skipping.');
  process.exit(0);
}

process.env.VERSION_CODE = versionCode;
process.env.MAPPING_FILE = mappingFile;
process.env.PACKAGE_NAME = process.env.PACKAGE_NAME || 'in.sahilsoni.fullfrillsbalance';
try {
  execFileSync(process.execPath, ['scripts/upload-mapping.js'], { stdio: 'inherit' });
} catch (err) {
  console.warn('upload-mapping-on-success: upload failed, but build succeeded:', err.message);
}
process.exit(0);
