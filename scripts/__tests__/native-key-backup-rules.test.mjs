import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { AndroidConfig, XML } = require('expo/config-plugins');
const withNativeKeyVault = require('../../plugins/withNativeKeyVault.js');
const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
  fileURLToPath(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url)),
);
const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
const expectedResources = {
  'android:fullBackupContent': '@xml/ffb_key_crypto_backup_rules',
  'android:dataExtractionRules': '@xml/ffb_key_crypto_data_extraction_rules',
};

test('the app selects the native vault rules without disabling ordinary backup', () => {
  assert.equal(application.$['android:allowBackup'], 'true');
  for (const [attribute, resource] of Object.entries(expectedResources)) {
    assert.equal(application.$[attribute], resource);
  }
});

test('Expo regeneration selects the same backup resources', async () => {
  const modResults = structuredClone(manifest);
  const regeneratedApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(modResults);
  for (const attribute of Object.keys(expectedResources)) {
    delete regeneratedApplication.$[attribute];
  }
  const config = withNativeKeyVault({ name: 'Backup policy test', slug: 'backup-policy-test' });
  const result = await config.mods.android.manifest({ ...config, modResults, modRequest: {} });
  const attributes = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults).$;
  for (const [attribute, resource] of Object.entries(expectedResources)) {
    assert.equal(attributes[attribute], resource);
  }
});

async function readSelectedRules(attribute) {
  const resourceName = application.$[attribute].replace('@xml/', '');
  return XML.readXMLAsync({
    path: fileURLToPath(
      new URL(
        `../../modules/expo-key-crypto/android/src/main/res/xml/${resourceName}.xml`,
        import.meta.url,
      ),
    ),
  });
}

const legacy = await readSelectedRules('android:fullBackupContent');
const modern = await readSelectedRules('android:dataExtractionRules');
for (const [name, policy] of [
  ['Android 11 and earlier backup', legacy['full-backup-content']],
  ['Android 12+ cloud backup', modern['data-extraction-rules']['cloud-backup'][0]],
  ['Android 12+ device transfer', modern['data-extraction-rules']['device-transfer'][0]],
]) {
  test(`${name} retains default file/database coverage and excludes device-key preferences`, () => {
    // Android treats any include as a whitelist, dropping unlisted domains such as SQLite/MMKV.
    assert.deepEqual(policy.include ?? [], [], 'An include would restrict default backup coverage');
    assert.deepEqual(
      policy.exclude.map(entry => entry.$).sort((a, b) => a.path.localeCompare(b.path)),
      [
        { domain: 'sharedpref', path: 'FFBKeyCrypto.xml' },
        { domain: 'sharedpref', path: 'SecureStore.xml' },
      ],
    );
  });
}
