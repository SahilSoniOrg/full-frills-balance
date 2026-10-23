import { execSync } from 'child_process';
import { ConfigContext, ExpoConfig } from 'expo/config';
import appVariants from './app-variants.json';

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

type AppVariant = keyof typeof appVariants;

const variant = (process.env.APP_VARIANT ?? 'production') as AppVariant;
const appConfig = appVariants[variant];

if (!appConfig) {
  throw new Error(
    `Unknown APP_VARIANT "${variant}". Expected one of: ${Object.keys(appVariants).join(', ')}.`,
  );
}

const bundledFonts = [
  {
    fontFamily: 'DMSerifDisplay-Regular',
    path: 'node_modules/@expo-google-fonts/dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf',
    weight: 400,
  },
  {
    fontFamily: 'InstrumentSans-Regular',
    path: 'node_modules/@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf',
    weight: 400,
  },
  {
    fontFamily: 'InstrumentSans-Medium',
    path: 'node_modules/@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf',
    weight: 500,
  },
  {
    fontFamily: 'InstrumentSans-SemiBold',
    path: 'node_modules/@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf',
    weight: 600,
  },
  {
    fontFamily: 'InstrumentSans-Bold',
    path: 'node_modules/@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf',
    weight: 700,
  },
  {
    fontFamily: 'Raleway-Regular',
    path: 'node_modules/@expo-google-fonts/raleway/400Regular/Raleway_400Regular.ttf',
    weight: 400,
  },
  {
    fontFamily: 'Raleway-Medium',
    path: 'node_modules/@expo-google-fonts/raleway/500Medium/Raleway_500Medium.ttf',
    weight: 500,
  },
  {
    fontFamily: 'Raleway-SemiBold',
    path: 'node_modules/@expo-google-fonts/raleway/600SemiBold/Raleway_600SemiBold.ttf',
    weight: 600,
  },
  {
    fontFamily: 'Raleway-Bold',
    path: 'node_modules/@expo-google-fonts/raleway/700Bold/Raleway_700Bold.ttf',
    weight: 700,
  },
  {
    fontFamily: 'Inter-Regular',
    path: 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
    weight: 400,
  },
  {
    fontFamily: 'Inter-Medium',
    path: 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
    weight: 500,
  },
  {
    fontFamily: 'Inter-SemiBold',
    path: 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
    weight: 600,
  },
  {
    fontFamily: 'Inter-Bold',
    path: 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
    weight: 700,
  },
  {
    fontFamily: 'CrimsonText-Regular',
    path: 'node_modules/@expo-google-fonts/crimson-text/400Regular/CrimsonText_400Regular.ttf',
    weight: 400,
  },
] as const;

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
    bundleIdentifier: appConfig.iosBundleIdentifier,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0A0A0C',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Gradle build types derive dev/preview IDs from this stable production base.
    package: appVariants.production.androidApplicationId,
    permissions: ['READ_SMS', 'RECEIVE_SMS'],
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ],
  },
  web: {
    // E2E web builds client-render: static prerendering touches browser storage at build time.
    output: process.env.EXPO_PUBLIC_E2E === '1' ? 'single' : 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    [
      'expo-font',
      {
        android: {
          fonts: bundledFonts.map(({ fontFamily, path, weight }) => ({
            fontFamily,
            fontDefinitions: [{ path, weight }],
          })),
        },
        ios: {
          fonts: bundledFonts.map(({ path }) => path),
        },
      },
    ],
    'expo-image',
    'expo-sharing',
    'expo-sqlite',
    'expo-status-bar',
    'expo-web-browser',
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
            pickFirst: ['**/*.so'],
            jniLibs: {
              useLegacyPackaging: false,
            },
          },
          ndkVersion: '27.1.12297006',
        },
        ios: {
          deploymentTarget: '16.4',
          // React Native 0.88.0's downloaded Core artifact lacks its module map here.
          buildReactNativeFromSource: true,
        },
      },
    ],
    'react-native-quick-crypto',
    'expo-localization',
    './plugins/withTelephony',
    './plugins/withGradleOptimizations',
    './plugins/withAndroidBuildVariants',
    './plugins/withAndroidNativeLibPackaging',
    './plugins/withJournalLauncherWidget',
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#ffffff',
        sounds: [],
      },
    ],
    [
      '@sentry/react-native',
      {
        url: 'https://sentry.io/',
        project: 'react-native',
        organization: 'full-frills-balance',
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow Full Frills to access the microphone for transaction parsing.',
        speechRecognitionPermission: 'Allow Full Frills to recognize your speech.',
      },
    ],
    [
      'expo-detox-config-plugin',
      {
        subdomains: '*',
      },
    ],
    [
      'expo-dev-launcher',
      {
        skipOnboarding: true,
        showMenuAtLaunch: false,
        ios: {
          toolsButton: false,
        },
      },
    ],
    './plugins/withXcodeAmbiguousDependencies',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
    e2eHarnessEnabled: process.env.EXPO_PUBLIC_E2E === '1',
    e2eSeedProfile: process.env.EXPO_PUBLIC_E2E_SEED_PROFILE,
    eas: {
      projectId: 'a9311be4-71b9-448c-b147-cb38ef622218',
    },
    gitCommit,
  },
  owner: 'sscsps',
});
