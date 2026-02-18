import { ConfigContext, ExpoConfig } from 'expo/config';

const getAppConfig = () => {
    const APP_VARIANT = process.env.APP_VARIANT;

    let appName = "Full Frills Balance";
    let packageName = "in.sahilsoni.fullfrillsbalance";

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
    slug: "full-frills-balance",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "fullfrillsbalance",
    userInterfaceStyle: "automatic",
    jsEngine: "hermes",
    newArchEnabled: true,
    ios: {
        supportsTablet: true,
        bundleIdentifier: appConfig.bundleIdentifier,
    },
    android: {
        adaptiveIcon: {
            backgroundColor: "#E6F4FE",
            foregroundImage: "./assets/images/android-icon-foreground.png",
            backgroundImage: "./assets/images/android-icon-background.png",
            monochromeImage: "./assets/images/android-icon-monochrome.png",
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        package: appConfig.package,
    },
    web: {
        output: "static",
        favicon: "./assets/images/favicon.png",
    },
    plugins: [
        "expo-sqlite",
        "@lovesworking/watermelondb-expo-plugin-sdk-52-plus",
        "expo-router",
        [
            "expo-splash-screen",
            {
                image: "./assets/images/splash-icon.png",
                imageWidth: 200,
                resizeMode: "contain",
                backgroundColor: "#ffffff",
                dark: {
                    backgroundColor: "#000000",
                },
            },
        ],
        [
            "expo-build-properties",
            {
                android: {
                    enableMinifyInReleaseBuilds: true,
                    packagingOptions: {
                        pickFirst: ["**/libc++_shared.so"],
                    },
                    ndkVersion: "27.1.12297006",
                },
                ios: {
                    deploymentTarget: "16.1",
                },
            },
        ],
        "react-native-quick-crypto",
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: true,
    },
    extra: {
        router: {},
        eas: {
            projectId: "a9311be4-71b9-448c-b147-cb38ef622218",
        },
    },
    owner: "sscsps",
});
