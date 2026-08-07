const { withGradleProperties, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

const MARKER_START = '// @generated begin native-lib-packaging - expo prebuild (DO NOT MODIFY)';
const MARKER_END = '// @generated end native-lib-packaging';

const SUBPROJECTS_BLOCK = `${MARKER_START}
subprojects { subproject ->
  subproject.plugins.withId('com.android.library') {
    subproject.android {
      packagingOptions {
        pickFirst '**/*.so'
      }
    }
  }
  subproject.plugins.withId('com.android.application') {
    subproject.android {
      packagingOptions {
        pickFirst '**/*.so'
      }
    }
  }
}
${MARKER_END}`;

/**
 * Survives `expo prebuild --clean`: fixes duplicate native .so collisions when building
 * Detox androidTest (and release APKs) across Expo modules + React Native.
 */
module.exports = function withAndroidNativeLibPackaging(config) {
  config = withGradleProperties(config, cfg => {
    const props = cfg.modResults;
    const key = 'android.packagingOptions.pickFirsts';
    const value = '**/*.so';
    const index = props.findIndex(p => p.type === 'property' && p.key === key);

    if (index !== -1) {
      props[index].value = value;
    } else {
      props.push({ type: 'property', key, value });
    }

    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async cfg => {
      const buildGradlePath = path.join(cfg.modRequest.platformProjectRoot, 'build.gradle');
      let content = await fs.readFile(buildGradlePath, 'utf8');

      if (content.includes(MARKER_START)) {
        return cfg;
      }

      const anchor = 'apply plugin: "expo-root-project"';
      if (!content.includes(anchor)) {
        throw new Error(
          'withAndroidNativeLibPackaging: expected `apply plugin: "expo-root-project"` in android/build.gradle',
        );
      }

      content = content.replace(anchor, `${SUBPROJECTS_BLOCK}\n\n${anchor}`);
      await fs.writeFile(buildGradlePath, content, 'utf8');
      return cfg;
    },
  ]);

  return config;
};
