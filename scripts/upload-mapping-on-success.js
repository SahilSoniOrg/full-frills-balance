// EAS build lifecycle hook: runs at the end of a successful build.
// Copies the R8 mapping file to the project root so it can be uploaded
// to Play Console after the AAB is submitted (upload requires the version
// code to already exist in Play Console).

const fs = require('fs');
const path = require('path');

if (process.env.EAS_BUILD_PLATFORM !== 'android') {
  process.exit(0);
}

const mappingFile = 'android/app/build/outputs/mapping/release/mapping.txt';
if (!fs.existsSync(mappingFile)) {
  console.log('eas-build-on-success: mapping.txt not found, skipping.');
  process.exit(0);
}

const projectRoot = process.env.EAS_PROJECT_ROOT || process.cwd();
const dest = path.join(projectRoot, 'mapping.txt');
try {
  fs.copyFileSync(mappingFile, dest);
  console.log('eas-build-on-success: copied mapping.txt to', dest);
} catch (err) {
  console.warn('eas-build-on-success: failed to copy mapping.txt:', err.message);
}

process.exit(0);
