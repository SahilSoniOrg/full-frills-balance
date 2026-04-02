const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemoveMediaPermissions(config) {
  return withAndroidManifest(config, async config => {
    let androidManifest = config.modResults.manifest;

    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const permissionsToRemove = [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECT',
    ];

    permissionsToRemove.forEach(permissionName => {
      // Remove any existing standard permission entry for this
      androidManifest['uses-permission'] = androidManifest['uses-permission'].filter(
        perm => !perm.$ || perm.$['android:name'] !== permissionName,
      );

      // Add the tools:node="remove" entry to override library manifests
      androidManifest['uses-permission'].push({
        $: {
          'android:name': permissionName,
          'tools:node': 'remove',
        },
      });
    });

    // Ensure the xmlns:tools is available in the manifest
    if (!androidManifest.$['xmlns:tools']) {
      androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
};
