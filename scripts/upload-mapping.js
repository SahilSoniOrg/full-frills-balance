/* global Buffer, process */
// Uploads an R8 ProGuard mapping file to Google Play Console for a given versionCode.
// Uses resumable (chunked) upload to handle large files (~69MB+) without timeouts.
// Usage:
//   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=... VERSION_CODE=... MAPPING_FILE=... \
//   PACKAGE_NAME=... node scripts/upload-mapping.js

const fs = require('fs');
const crypto = require('crypto');
const { Agent, setGlobalDispatcher } = require('undici');

// Increase timeouts for large uploads
setGlobalDispatcher(
  new Agent({
    headersTimeout: 10 * 60 * 1000,
    bodyTimeout: 10 * 60 * 1000,
    connectTimeout: 30 * 1000,
    keepAliveTimeout: 60 * 1000,
    keepAliveMaxTimeout: 10 * 60 * 1000,
  }),
);

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

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Attempt ${i + 1} failed: ${err.message}, retrying...`);
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

async function main() {
  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };

  // 1. Create an edit
  const editRes = await fetchWithRetry(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`,
    { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (!editRes.ok) throw new Error('Create edit failed: ' + (await editRes.text()));
  const edit = await editRes.json();
  const editId = edit.id;
  console.log('Edit created:', editId);

  // 2. Initiate resumable upload session
  const fileSize = fs.statSync(mappingFile).size;
  const sessionUrl_base = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/apks/${versionCode}/deobfuscationFiles/proguard?uploadType=resumable`;
  const initRes = await fetchWithRetry(sessionUrl_base, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(fileSize),
    },
    body: JSON.stringify({}),
  });
  if (!initRes.ok) throw new Error('Initiate upload failed: ' + (await initRes.text()));
  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) throw new Error('No session URL returned');
  console.log('Resumable session started. File size:', fileSize);

  // 3. Upload in chunks (5MB, must be multiple of 256KB)
  const CHUNK = 5 * 1024 * 1024;
  const buf = fs.readFileSync(mappingFile);
  let start = 0;
  while (start < buf.length) {
    const end = Math.min(start + CHUNK, buf.length);
    const chunk = buf.subarray(start, end);
    const res = await fetchWithRetry(sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end - 1}/${buf.length}`,
      },
      body: chunk,
    });
    if (res.status === 308) {
      start = end;
      console.log(`Uploaded ${end}/${buf.length} bytes`);
    } else if (res.ok) {
      console.log('Upload complete:', await res.json());
      break;
    } else {
      // Resume: query status
      const status = await fetchWithRetry(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${buf.length}` },
      });
      if (status.status === 308) {
        const range = status.headers.get('Range');
        start = range ? parseInt(range.split('-')[1], 10) + 1 : 0;
        console.log('Resuming from byte', start);
      } else if (status.ok) {
        console.log('Already complete');
        break;
      } else {
        throw new Error(`Upload failed: ${status.status} ${await status.text()}`);
      }
    }
  }

  // 4. Commit the edit
  const commitRes = await fetchWithRetry(
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
