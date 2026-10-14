const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

// Resources come from the local ExpoKeyCrypto module, including exclusions for
// both our native preferences and the remaining Expo SecureStore consumers.
module.exports = config =>
  withAndroidManifest(config, result => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    application.$['android:fullBackupContent'] = '@xml/ffb_key_crypto_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/ffb_key_crypto_data_extraction_rules';
    return result;
  });
