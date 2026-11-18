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

async function request(token, method, url, { body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed (${response.status}): ${await response.text()}`);
  }
  return response;
}

async function play(token, method, url, body) {
  const response = await request(token, method, url, {
    body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// Google recommends resumable uploads for anything larger than a few megabytes.
async function uploadBundle(token, url, bundle) {
  const session = await request(token, 'POST', `${url}?uploadType=resumable`, {
    headers: {
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(bundle.length),
    },
  });
  const response = await request(token, 'PUT', session.headers.get('location'), {
    body: bundle,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  return response.json();
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
const { versionCode } = await uploadBundle(
  token,
  `${UPLOAD_API}/${packageName}/edits/${editId}/bundles`,
  readFileSync(aabPath),
);
await play(token, 'PUT', `${API}/${packageName}/edits/${editId}/tracks/${track}`, {
  track,
  releases: [{ versionCodes: [String(versionCode)], status: 'completed' }],
});
// The API's default cancels whatever is already in review and resubmits it with this edit.
await play(
  token,
  'POST',
  `${API}/${packageName}/edits/${editId}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
);
console.log(`Version code ${versionCode} is on the ${track} track.`);
