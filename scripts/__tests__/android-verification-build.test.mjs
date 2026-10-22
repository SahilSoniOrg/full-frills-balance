import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { setAndroidBuildVariants } = require('../../plugins/withAndroidBuildVariants.js');
const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

test('Expo regeneration preserves the checked-in disposable Release build configuration', () => {
  assert.equal(setAndroidBuildVariants(gradle), gradle);
  const generated = setAndroidBuildVariants(
    'android { defaultConfig { applicationId "example.app" } }',
  );
  assert.match(
    generated,
    /verification\s*\{\s*initWith release\s*applicationIdSuffix "\.verification"/,
  );
  assert.match(generated, /verification\s*\{[^}]*matchingFallbacks = \['release'\]/);
  assert.equal(setAndroidBuildVariants(generated), generated);
});

test('the physical verification configuration selects the disposable APK and instrumentation', () => {
  const previous = process.env.DETOX_ANDROID_DEVICE_ID;
  try {
    process.env.DETOX_ANDROID_DEVICE_ID = 'configuration-only-test';
    delete require.cache[require.resolve('../../.detoxrc.js')];
    const config = require('../../.detoxrc.js');
    assert.equal(config.configurations['android.device.verification'].app, 'android.verification');
    assert.equal(
      config.configurations['android.device.verification'].behavior.init.reinstallApp,
      true,
    );
    assert.equal(config.configurations['android.device.release'].app, 'android.release');
    assert.match(
      config.apps['android.verification'].binaryPath,
      /\/e2e\/app-verification\.apk$/,
    );
    assert.match(
      config.apps['android.verification'].testBinaryPath,
      /\/e2e\/app-verification-androidTest\.apk$/,
    );
    assert.equal(
      config.apps['android.verification'].build,
      'bash scripts/build-android-verification.sh e2e',
    );
  } finally {
    if (previous === undefined) delete process.env.DETOX_ANDROID_DEVICE_ID;
    else process.env.DETOX_ANDROID_DEVICE_ID = previous;
    delete require.cache[require.resolve('../../.detoxrc.js')];
  }
});
