# Android notification preview

A small native Android app for testing the proposed tinted notification panels in the real system notification shade. It posts sample spending and income notifications under **FFB Preview** and opens the preview app when tapped.

The main Expo app now has its own native renderer with tinted panels in both collapsed and expanded notifications. To test the actual integration, rebuild the main app with `bun run android` and send a test notification from Settings. See [the native module guide](../../modules/expo-notification-theme/README.md). This standalone app remains a separate design comparison tool.

## Run on a Mac

1. In Android Studio's SDK Manager, install Android SDK Platform 36, Build Tools 36.0.0, and Platform Tools. Have JDK 17 or newer on your `PATH`.
2. Start an AVD in Device Manager. An ARM64 image suits Apple Silicon; use Android 13 or newer to check the modern notification template.
3. From the repository root, run:

   ```sh
   bash scripts/android-notification-preview/run.sh
   ```

Expand a notification using its chevron to see the colored transaction panel and the native review action. Android controls the surrounding notification header, card, and action styling.

The script uses `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then the default macOS SDK location. Set `ANDROID_SERIAL=emulator-5554` if multiple devices are connected.

To compare the standard layout:

```sh
bash scripts/android-notification-preview/run.sh --standard
```

To compare light and dark modes, change the AVD's display theme, then rerun the script to refresh the previews. You can also switch with:

```sh
adb shell cmd uimode night yes
adb shell cmd uimode night no
```

To build without a running device:

```sh
bash scripts/android-notification-preview/run.sh --build-only
```

Build outputs and the local signing key stay in the ignored `build/` directory. Uninstall the prototype with:

```sh
adb uninstall in.sahilsoni.ffbnotificationpreview
```

The APK has been compiled and its signature verified on Linux. Device rendering and the macOS launch script still need verification on your AVD.
