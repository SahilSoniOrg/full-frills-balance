const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withTelephony(config) {
    return withAndroidManifest(config, async (config) => {
        let androidManifest = config.modResults.manifest;

        if (!androidManifest['uses-feature']) {
            androidManifest['uses-feature'] = [];
        }

        if (!Array.isArray(androidManifest['uses-feature'])) {
            androidManifest['uses-feature'] = [androidManifest['uses-feature']];
        }

        const telephonyFeature = androidManifest['uses-feature'].find(
            (item) => item.$ && item.$['android:name'] === 'android.hardware.telephony'
        );

        if (telephonyFeature) {
            telephonyFeature.$['android:required'] = 'false';
        } else {
            androidManifest['uses-feature'].push({
                $: {
                    'android:name': 'android.hardware.telephony',
                    'android:required': 'false',
                },
            });
        }

        return config;
    });
};
