import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `Usage: bun run android:publish [--build local|cloud] [--submit local|cloud|direct]

  --build   local  build the AAB on this machine (default)
            cloud  build on EAS
  --submit  local  submit ./build-android.aab from this machine
            cloud  EAS submits its own build when it finishes (needs --build cloud)
            direct upload ./build-android.aab from this machine straight to Google Play,
                   using the service account key in ./google-services.json
                   (or PLAY_SERVICE_ACCOUNT_KEY_PATH)
            Defaults to wherever the build runs.`;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const AAB = './build-android.aab';
// The R8 mapping ships inside the AAB and Play Console reads it from there.
const MAPPING = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map';
const EAS_BUILD = [
  'build',
  '--platform',
  'android',
  '--profile',
  'production',
  '--non-interactive',
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

let flags;
try {
  flags = parseArgs({
    options: {
      build: { type: 'string', default: 'local' },
      submit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (error) {
  fail(`${error.message}\n\n${USAGE}`);
}
if (flags.help) {
  console.log(USAGE);
  process.exit(0);
}

const build = flags.build;
const submit = flags.submit ?? build;
if (!['local', 'cloud'].includes(build) || !['local', 'cloud', 'direct'].includes(submit)) {
  fail(USAGE);
}
if (build === 'local' && submit === 'cloud') {
  fail(
    'A local build only exists on this machine, so EAS has nothing to submit. Use --submit local.',
  );
}

if (submit === 'cloud') {
  run('eas', [...EAS_BUILD, '--auto-submit']);
  process.exit(0);
}

rmSync(join(projectRoot, AAB), { force: true });
if (build === 'local') {
  run('eas', [...EAS_BUILD, '--local', '--output', AAB]);
} else {
  const { stdout } = run('eas', [...EAS_BUILD, '--json'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  const [cloudBuild] = JSON.parse(stdout);
  const archiveUrl = cloudBuild?.artifacts?.applicationArchiveUrl;
  if (cloudBuild?.status !== 'FINISHED' || !archiveUrl) {
    fail(`EAS build did not produce an AAB (status: ${cloudBuild?.status ?? 'unknown'}).`);
  }
  run('curl', ['--fail', '--location', '--progress-bar', '--output', AAB, archiveUrl]);
}

if (spawnSync('unzip', ['-l', AAB, MAPPING], { cwd: projectRoot }).status !== 0) {
  fail(`${AAB} has no embedded R8 mapping (${MAPPING}); not submitting.`);
}

if (submit === 'direct') {
  run('node', ['scripts/submit-android-local.mjs']);
  process.exit(0);
}

run('eas', [
  'submit',
  '--platform',
  'android',
  '--profile',
  'production',
  '--path',
  AAB,
  '--non-interactive',
]);
