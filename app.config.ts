import { execSync } from 'child_process';
import { ConfigContext, ExpoConfig } from 'expo/config';

// Automatically generate PNG assets from the SVG if they don't exist, are out of date, or during prebuild
try {
  execSync('node ./scripts/generate-assets.js', { stdio: ['ignore', 'ignore', 'inherit'] });
} catch (e) {
  console.warn('Asset generation failed:', e);
}

const getGitCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (e) {
    console.warn('Could not fetch git commit', e);
    return '';
  }
};

const gitCommit = getGitCommit();

const getAppConfig = () => {
  const APP_VARIANT = process.env.APP_VARIANT;

  let appName = 'Full Frills Balance';
  let packageName = 'in.sahilsoni.fullfrillsbalance';

  if (APP_VARIANT === 'development') {
    packageName = `${packageName}.dev`;
    appName = `${appName} (Dev)`;
  } else if (APP_VARIANT === 'preview') {
    packageName = `${packageName}.preview`;
    appName = `${appName} (Preview)`;
  }

  return {
    bundleIdentifier: packageName,
    package: packageName,
    name: appName,
  };
};

const appConfig = getAppConfig();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appConfig.name,
  slug: 'full-frills-balance',
  version: '1.0.0',
  runtimeVersion: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'fullfrillsbalance',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: appConfig.bundleIdentifier,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0A0A0C',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: appConfig.package,
    permissions: ['READ_SMS'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-font',
    'expo-image',
    'expo-sharing',
    'expo-web-browser',
    'expo-sqlite',
    '@lovesworking/watermelondb-expo-plugin-sdk-52-plus',
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#0A0A0C',
        dark: {
          backgroundColor: '#0A0A0C',
        },
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          shrinkResources: true,
          packagingOptions: {
            pickFirst: ['**/libc++_shared.so'],
            jniLibs: {
              useLegacyPackaging: false,
            },
          },
          ndkVersion: '27.1.12297006',
        },
        ios: {
          deploymentTarget: '16.4',
        },
      },
    ],
    'react-native-quick-crypto',
    'expo-localization',
    './plugins/withTelephony',
    './plugins/withGradleOptimizations',
    './plugins/withRemoveMediaPermissions',
    './plugins/withJournalLauncherWidget',
    './plugins/withXcodeAmbiguousDependencies',
    './plugins/withLiteRTNativeLibraries',
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#ffffff',
        sounds: [],
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'react-native',
        organization: 'full-frills-balance',
      },
    ],
    '@sentry/react-native',
    'react-native-litert-lm',
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow Full Frills to access the microphone for transaction parsing.',
        speechRecognitionPermission: 'Allow Full Frills to recognize your speech.',
      },
    ],
    [
      '@config-plugins/detox',
      {
        subdomains: '*',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    e2eHarnessEnabled: process.env.EXPO_PUBLIC_E2E === '1',
    eas: {
      projectId: 'a9311be4-71b9-448c-b147-cb38ef622218',
    },
    gitCommit,
  },
  owner: 'sscsps',
});
