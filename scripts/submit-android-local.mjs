import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD_API = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function accessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(serviceAccount.private_key)
    .toString('base64url');

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Google token request failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function play(token, method, url, { body, contentType = 'application/json' } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: contentType === 'application/json' && body ? JSON.stringify(body) : body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

const keyPath = resolve(
  projectRoot,
  process.env.PLAY_SERVICE_ACCOUNT_KEY_PATH ?? 'google-services.json',
);
const aabPath = resolve(projectRoot, process.env.ANDROID_AAB_PATH ?? 'build-android.aab');
if (!existsSync(keyPath)) {
  fail(
    `No Play service account key at ${keyPath}. Set PLAY_SERVICE_ACCOUNT_KEY_PATH, or submit through EAS with \`bun run android:publish\`.`,
  );
}
if (!existsSync(aabPath)) fail(`No app bundle at ${aabPath}. Set ANDROID_AAB_PATH.`);

const packageName = readJson(join(projectRoot, 'app-variants.json')).production
  .androidApplicationId;
const track = readJson(join(projectRoot, 'eas.json')).submit.production.android.track;
const serviceAccount = readJson(keyPath);

const token = await accessToken(serviceAccount);
const { id: editId } = await play(token, 'POST', `${API}/${packageName}/edits`);
console.log(`Uploading ${aabPath} to ${packageName}…`);
const { versionCode } = await play(
  token,
  'POST',
  `${UPLOAD_API}/${packageName}/edits/${editId}/bundles?uploadType=media`,
  { body: readFileSync(aabPath), contentType: 'application/octet-stream' },
);
await play(token, 'PUT', `${API}/${packageName}/edits/${editId}/tracks/${track}`, {
  body: { track, releases: [{ versionCodes: [String(versionCode)], status: 'completed' }] },
});
await play(token, 'POST', `${API}/${packageName}/edits/${editId}:commit`);
console.log(`Version code ${versionCode} is on the ${track} track.`);
