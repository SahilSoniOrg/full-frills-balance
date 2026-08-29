const { withAppBuildGradle } = require('expo/config-plugins');
const appVariants = require('../app-variants.json');

const MARKER_START = '// @generated begin android-build-variants - expo prebuild (DO NOT MODIFY)';
const MARKER_END = '// @generated end android-build-variants';

function escapeGroovyString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function applicationIdSuffix(baseId, applicationId) {
  if (!applicationId.startsWith(`${baseId}.`)) {
    throw new Error(
      `Android variant application ID "${applicationId}" must extend production ID "${baseId}".`,
    );
  }

  return applicationId.slice(baseId.length);
}

function createBuildTypesBlock() {
  const production = appVariants.production;
  const development = appVariants.development;
  const preview = appVariants.preview;
  const developmentSuffix = applicationIdSuffix(
    production.androidApplicationId,
    development.androidApplicationId,
  );
  const previewSuffix = applicationIdSuffix(
    production.androidApplicationId,
    preview.androidApplicationId,
  );

  return `${MARKER_START}
android {
    buildTypes {
        debug {
            applicationIdSuffix "${escapeGroovyString(developmentSuffix)}"
            resValue "string", "app_name", "${escapeGroovyString(development.name)}"
        }
        release {
            resValue "string", "app_name", "${escapeGroovyString(production.name)}"
        }
        preview {
            initWith release
            applicationIdSuffix "${escapeGroovyString(previewSuffix)}"
            resValue "string", "app_name", "${escapeGroovyString(preview.name)}"
            matchingFallbacks = ['release']
        }
    }
}
${MARKER_END}`;
}

function setAndroidBuildVariants(buildGradle) {
  const generatedBlock = createBuildTypesBlock();
  const existingBlock = new RegExp(
    `${MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );

  if (existingBlock.test(buildGradle)) {
    return buildGradle.replace(existingBlock, generatedBlock);
  }

  return `${buildGradle.trimEnd()}\n\n${generatedBlock}\n`;
}

module.exports = function withAndroidBuildVariants(config) {
  const productionApplicationId = appVariants.production.androidApplicationId;
  if (config.android?.package !== productionApplicationId) {
    throw new Error(
      `withAndroidBuildVariants requires expo.android.package to be the production ID "${productionApplicationId}".`,
    );
  }

  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAndroidBuildVariants only supports Groovy app/build.gradle files.');
    }

    config.modResults.contents = setAndroidBuildVariants(config.modResults.contents);
    return config;
  });
};

module.exports.setAndroidBuildVariants = setAndroidBuildVariants;
