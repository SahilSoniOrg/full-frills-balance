import { createHash, createSign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER_BYTES,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} was terminated by ${result.signal}.`);
  }
  if (result.status !== 0) {
    const diagnostic = [result.stderr, result.stdout]
      .filter(Boolean)
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n');
    throw new Error(
      `${command} exited with status ${result.status}${diagnostic ? `:\n${diagnostic}` : '.'}`,
    );
  }

  return result.stdout ?? '';
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createAppStoreConnectJwt(privateKey, keyId, issuerId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign('SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');

  return `${unsignedToken}.${signature}`;
}

function findApiKeyPath(keyId) {
  const filename = `AuthKey_${keyId}.p8`;
  const candidates = [
    process.env.ASC_API_KEY_PATH,
    process.env.API_PRIVATE_KEYS_DIR && join(process.env.API_PRIVATE_KEYS_DIR, filename),
    join(process.cwd(), 'private_keys', filename),
    join(homedir(), 'private_keys', filename),
    join(homedir(), '.private_keys', filename),
    join(homedir(), '.appstoreconnect', 'private_keys', filename),
  ].filter(Boolean);

  const keyPath = candidates.map(resolve).find(existsSync);
  if (!keyPath) {
    throw new Error(
      `Could not find ${filename}. Set ASC_API_KEY_PATH or API_PRIVATE_KEYS_DIR to its directory.`,
    );
  }
  if (basename(keyPath) !== filename) {
    throw new Error(`The API key file must be named ${filename} for this Xcode altool.`);
  }

  return keyPath;
}

async function verifyAppStoreRecord(appId, expectedBundleId, jwt) {
  const url = new URL(
    `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appId)}`,
  );
  url.searchParams.set('fields[apps]', 'bundleId,name');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Could not verify App Store Connect app ${appId} (${response.status}): ${body.slice(0, 1000)}`,
    );
  }

  const result = await response.json();
  const app = result.data?.attributes;
  if (!app?.bundleId) {
    throw new Error(`App Store Connect returned no bundle ID for app ${appId}.`);
  }
  if (app.bundleId !== expectedBundleId) {
    throw new Error(
      `App Store Connect app ID ${appId} belongs to ${app.bundleId}, expected ${expectedBundleId}.`,
    );
  }

  return app;
}

function readPlistValue(plistPath, key) {
  return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath]).trim();
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function confirmBuildNumber(buildNumber) {
  const expectedBuildNumber = process.env.IOS_CONFIRM_BUILD_NUMBER;
  if (expectedBuildNumber) {
    if (expectedBuildNumber !== buildNumber) {
      throw new Error(
        `Build number confirmation mismatch: expected ${expectedBuildNumber}, IPA contains ${buildNumber}.`,
      );
    }
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Set IOS_CONFIRM_BUILD_NUMBER=${buildNumber} to confirm this upload in a non-interactive run.`,
    );
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(`Type build number ${buildNumber} to upload: `);
    if (answer.trim() !== buildNumber) throw new Error('Upload cancelled: build number did not match.');
  } finally {
    terminal.close();
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Direct iOS upload requires macOS and Xcode.');
  }

  const ipaArgument = process.env.IOS_IPA_PATH;
  if (!ipaArgument) {
    throw new Error('Set IOS_IPA_PATH to the exact IPA to upload.');
  }
  const ipaPath = resolve(ipaArgument);
  if (!existsSync(ipaPath)) throw new Error(`IPA not found: ${ipaPath}`);

  const apiKeyId = process.env.ASC_API_KEY_ID;
  const apiIssuerId = process.env.ASC_API_ISSUER_ID;
  if (!apiKeyId || !apiIssuerId) {
    throw new Error('Set ASC_API_KEY_ID and ASC_API_ISSUER_ID for direct Apple upload.');
  }

  const buildReceiptPath = `${ipaPath}.sha256`;
  const expectedHash = process.env.IOS_IPA_SHA256 ??
    (existsSync(buildReceiptPath) ? readFileSync(buildReceiptPath, 'utf8').trim().split(/\s+/)[0] : '');
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    throw new Error(
      `No valid SHA-256 receipt for ${ipaPath}. Build it with bun run ios:build:local, or set IOS_IPA_SHA256 explicitly.`,
    );
  }

  run('unzip', ['-tqq', ipaPath]);
  const ipaEntries = run('unzip', ['-Z1', ipaPath]).split('\n');
  const infoPlistEntry = ipaEntries.find((entry) =>
    /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry),
  );
  if (!infoPlistEntry) throw new Error(`IPA has no top-level app Info.plist: ${ipaPath}`);

  const appVariants = JSON.parse(readFileSync('app-variants.json', 'utf8'));
  const expectedBundleId = appVariants.production?.iosBundleIdentifier;
  if (!expectedBundleId) {
    throw new Error('Missing appVariants.production.iosBundleIdentifier in app-variants.json.');
  }

  const easConfig = JSON.parse(readFileSync('eas.json', 'utf8'));
  const appleAppId = String(easConfig.submit?.production?.ios?.ascAppId ?? '');
  if (!/^\d+$/.test(appleAppId)) {
    throw new Error('Missing numeric submit.production.ios.ascAppId in eas.json.');
  }

  const apiKeyPath = findApiKeyPath(apiKeyId);
  const apiPrivateKey = readFileSync(apiKeyPath, 'utf8');
  const jwt = createAppStoreConnectJwt(apiPrivateKey, apiKeyId, apiIssuerId);
  const appStoreRecord = await verifyAppStoreRecord(appleAppId, expectedBundleId, jwt);

  const altoolHelp = run('xcrun', ['altool', '--help']);
  const requiredOptions = ['--validate-app', '--upload-package', '--api-key', '--api-issuer'];
  const missingOptions = requiredOptions.filter((option) => !altoolHelp.includes(option));
  if (missingOptions.length > 0) {
    throw new Error(
      `Installed altool does not support ${missingOptions.join(', ')}. Update Xcode or use Transporter.`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'full-frills-ios-submit-'));
  try {
    const plistPath = join(tempDir, 'Info.plist');
    const plist = spawnSync('unzip', ['-p', ipaPath, infoPlistEntry], {
      maxBuffer: 4 * 1024 * 1024,
    });
    if (plist.error) throw plist.error;
    if (plist.signal) throw new Error(`unzip was terminated by ${plist.signal}.`);
    if (plist.status !== 0) throw new Error(`Could not read ${infoPlistEntry} from the IPA.`);
    writeFileSync(plistPath, plist.stdout);

    const bundleId = readPlistValue(plistPath, 'CFBundleIdentifier');
    const version = readPlistValue(plistPath, 'CFBundleShortVersionString');
    const buildNumber = readPlistValue(plistPath, 'CFBundleVersion');
    if (bundleId !== expectedBundleId) {
      throw new Error(`Bundle ID mismatch: expected ${expectedBundleId}, IPA contains ${bundleId}.`);
    }
    if (!version || !buildNumber) throw new Error('IPA is missing its version or build number.');

    const actualHash = await sha256File(ipaPath);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(`IPA checksum changed since the build receipt was written: ${ipaPath}`);
    }

    console.log(`IPA: ${ipaPath}`);
    console.log(`SHA-256: ${actualHash}`);
    console.log(`App: ${appStoreRecord.name} (${appleAppId})`);
    console.log(`Bundle ID: ${bundleId}`);
    console.log(`Version: ${version} (${buildNumber})`);
    await confirmBuildNumber(buildNumber);

    const authArgs = ['--api-key', apiKeyId, '--api-issuer', apiIssuerId];
    if (process.env.ASC_PROVIDER_PUBLIC_ID) {
      authArgs.push('--provider-public-id', process.env.ASC_PROVIDER_PUBLIC_ID);
    }
    const altoolEnv = {
      ...process.env,
      API_PRIVATE_KEYS_DIR: dirname(apiKeyPath),
    };

    console.log('Validating with Apple before upload…');
    run('xcrun', ['altool', '--validate-app', ipaPath, ...authArgs], {
      env: altoolEnv,
      stdio: 'inherit',
    });

    console.log('Uploading directly to App Store Connect…');
    run('xcrun', ['altool', '--upload-package', ipaPath, ...authArgs], {
      env: altoolEnv,
      stdio: 'inherit',
    });
    console.log(
      'Upload transfer accepted. Apple still needs to process the build before it appears in TestFlight.',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
