/* global Buffer */
// Uploads an R8 ProGuard mapping file to Google Play Console for a given versionCode.
// Usage:
//   PACKAGE_NAME=... VERSION_CODE=... MAPPING_FILE=... \
//   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=... node scripts/upload-mapping.js
//
// Requires Node 18+ (built-in fetch/crypto/fs). No external dependencies.

const fs = require('fs');
const crypto = require('crypto');

const packageName = process.env.PACKAGE_NAME;
const versionCode = process.env.VERSION_CODE;
const mappingFile = process.env.MAPPING_FILE;
const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

if (!packageName || !versionCode || !mappingFile || !keyPath) {
  console.error(
    'Missing required env: PACKAGE_NAME, VERSION_CODE, MAPPING_FILE, GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key);
  const jwt = signingInput + '.' + base64url(signature);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error('Token exchange failed: ' + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

async function main() {
  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };

  // 1. Create an edit
  const editRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`,
    { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (!editRes.ok) throw new Error('Create edit failed: ' + (await editRes.text()));
  const edit = await editRes.json();
  const editId = edit.id;

  // 2. Upload the mapping file
  const mapping = fs.readFileSync(mappingFile);
  const uploadRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}/apks/${versionCode}/deobfuscationFiles/proguard?uploadType=media`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'text/plain' },
      body: mapping,
    },
  );
  if (!uploadRes.ok) throw new Error('Upload mapping failed: ' + (await uploadRes.text()));
  console.log('Mapping uploaded:', await uploadRes.json());

  // 3. Commit the edit
  const commitRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}:commit`,
    { method: 'POST', headers: auth },
  );
  if (!commitRes.ok) throw new Error('Commit edit failed: ' + (await commitRes.text()));
  console.log('Edit committed successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
