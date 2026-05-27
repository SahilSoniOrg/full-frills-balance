const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

const PLUGIN_NAME = 'withLiteRTNativeLibraries';
const PLUGIN_VERSION = '1.0.0';

function withLiteRTNativeLibraries(config) {
  // 1. Android Manifest changes
  config = withAndroidManifest(config, async config => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error(
        `${PLUGIN_NAME} could not locate Android application node in AndroidManifest.xml.`,
      );
    }

    application['uses-native-library'] = application['uses-native-library'] || [];

    const nativeLibs = [
      'libvndksupport.so',
      'libOpenCL.so',
      'libcdsprpc.so',
      'libedgetpu_litert.so',
    ];

    nativeLibs.forEach(libName => {
      const exists = application['uses-native-library'].some(
        item => item.$?.['android:name'] === libName,
      );
      if (!exists) {
        application['uses-native-library'].push({
          $: {
            'android:name': libName,
            'android:required': 'false',
          },
        });
      }
    });

    return config;
  });

  // 2. Proguard rules changes
  config = withDangerousMod(config, [
    'android',
    async config => {
      const proguardPath = path.join(
        config.modRequest.projectRoot,
        'android',
        'app',
        'proguard-rules.pro',
      );
      try {
        let content = await fs.readFile(proguardPath, 'utf8');
        const rules = [
          '',
          '# Keep LiteRT-LM classes to prevent JNI crashes due to Proguard/R8 obfuscation',
          '-keep class com.google.ai.edge.litertlm.** { *; }',
          '-keep interface com.google.ai.edge.litertlm.** { *; }',
          '-keep class dev.litert.litertlm.** { *; }',
          '-keep interface dev.litert.litertlm.** { *; }',
        ].join('\n');

        if (!content.includes('com.google.ai.edge.litertlm.**')) {
          content += rules;
          await fs.writeFile(proguardPath, content, 'utf8');
        }
      } catch (e) {
        console.warn('Failed to apply LiteRT Proguard rules:', e);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withLiteRTNativeLibraries;
