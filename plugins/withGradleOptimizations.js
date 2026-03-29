const { withGradleProperties } = require('@expo/config-plugins');

const OPTIMIZATIONS = {
  'org.gradle.jvmargs': '-Xmx8192m -XX:MaxMetaspaceSize=2048m -XX:+UseParallelGC',
  'org.gradle.caching': 'true',
  'android.enablePngCrunchInReleaseBuilds': 'false',
  reactNativeArchitectures: 'arm64-v8a,armeabi-v7a',
};

module.exports = function withGradleOptimizations(config) {
  return withGradleProperties(config, config => {
    const props = config.modResults;

    for (const [key, value] of Object.entries(OPTIMIZATIONS)) {
      const index = props.findIndex(p => p.type === 'property' && p.key === key);

      if (index !== -1) {
        props[index].value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    }

    return config;
  });
};
