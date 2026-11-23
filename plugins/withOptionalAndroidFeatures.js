const { withAndroidManifest } = require('expo/config-plugins');

const optionalFeatures = ['android.hardware.telephony', 'android.hardware.screen.portrait'];

module.exports = function withOptionalAndroidFeatures(config) {
  return withAndroidManifest(config, modConfig => {
    const manifest = modConfig.modResults.manifest;
    const features = [manifest['uses-feature'] ?? []].flat();

    for (const name of optionalFeatures) {
      const feature = features.find(item => item.$?.['android:name'] === name);

      if (feature) {
        feature.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }

    manifest['uses-feature'] = features;
    return modConfig;
  });
};
