const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure 16KB memory page size support on Android.
 * This is required for Android 15+ devices and Google Play Store submission.
 */
const withAndroid16KBPageSize = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const buildGradle = config.modResults.contents;
      
      const injection = `
// --- 16KB Page Size Support Start ---
subprojects {
    afterEvaluate { project ->
        if (project.plugins.hasPlugin('com.android.library') || project.plugins.hasPlugin('com.android.application')) {
            android {
                // Ensure native libraries are aligned to 16KB
                packagingOptions {
                    jniLibs {
                        useLegacyPackaging = false
                    }
                }
                
                // Inject linker flags for CMake builds
                defaultConfig {
                    externalNativeBuild {
                        cmake {
                            // Linker flags for 16KB page alignment
                            arguments "-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-z,max-page-size=16384"
                        }
                    }
                }
            }
        }
    }
}
// --- 16KB Page Size Support End ---
`;
      if (!buildGradle.includes('max-page-size=16384')) {
        config.modResults.contents = buildGradle + injection;
      }
    }
    return config;
  });
};

module.exports = withAndroid16KBPageSize;
