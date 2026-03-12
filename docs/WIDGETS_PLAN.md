# Widgets Plan

## Goal

Launch transaction journal creation directly from the home screen on both Android and iOS.

## V1 Scope

V1 is intentionally small:

- Android compact launcher widget
- iOS compact WidgetKit launcher
- Both expose three entry points:

```text
fullfrillsbalance://journal-entry?mode=simple&type=income&source=widget
fullfrillsbalance://journal-entry?mode=simple&type=expense&source=widget
fullfrillsbalance://journal-entry?mode=simple&type=transfer&source=widget
```

- The app reuses the existing Expo Router `journal-entry` screen.
- The intended form factor is compact:
  - Android: roughly `2 x 1`
  - iOS: `systemSmall`

This keeps widget logic native and keeps transaction creation in the existing React Native flow.

## Prebuild Support

The widget setup is now also encoded in an Expo config plugin:

- `plugins/withJournalLauncherWidget.js`
- registered in `app.config.ts`

That means `expo prebuild --clean` is now the intended way to recreate the widget native setup from the codebase.

The plugin is responsible for:

- Android manifest receiver registration
- Android widget strings
- iOS Xcode target creation/update for the widget extension
- copying widget implementation files from the widget module templates into the generated native projects

## Module Split

Widget support now follows the same broad pattern as the SMS integration, but with an extra requirement:

- `modules/expo-widgets`
  - holds real native/module code and widget template files
  - is where future runtime APIs for widget data sync and refresh should live
- `plugins/withJournalLauncherWidget.js`
  - stays small
  - installs widget project structure during prebuild
  - links the iOS widget target and Android widget registration

Why both are needed:

- a module is good for runtime behavior
- a plugin is still required because widgets need native project structure that must exist before build time

In practice:

- launcher widgets can mostly be implemented with template files plus a thin plugin
- data widgets like `Safe to Spend` will also use the module for shared storage and refresh APIs

## Why This Shape

Home screen widgets are native surfaces on both platforms.

- Android widgets are implemented with `AppWidgetProvider` / `RemoteViews`
- iOS widgets are implemented with `WidgetKit`
- React Native is used for the screen the widget opens, not for rendering the widget itself

That is the lowest-risk approach for an Expo app with native folders committed.

## Implemented Files

### Shared app contract

- `src/features/journal/entry/hooks/useJournalEntryViewModel.ts`
  - Normalizes widget and seeded deep-link params
  - Accepts both `sourceAccountId` and the old `sourceId` fallback
- `src/utils/navigation.ts`
  - Adds a helper for widget-driven journal launches
- `src/types/routes.ts`
  - Documents the route params used by widget launches
- `src/features/accounts/hooks/useAccountDetailsViewModel.ts`
  - Switches in-app seeded navigation to `sourceAccountId`

### Android

- `modules/expo-widgets/android/src/main/java/expo/modules/widgets/ExpoWidgetsModule.kt`
- `modules/expo-widgets/templates/android/*`
- `plugins/withJournalLauncherWidget.js`
- `android/app/src/main/java/in/sahilsoni/fullfrillsbalance/JournalLauncherWidgetProvider.kt`
- `android/app/src/main/res/layout/widget_journal_launcher.xml`
- `android/app/src/main/res/drawable/widget_journal_launcher_background.xml`
- `android/app/src/main/res/drawable/widget_journal_launcher_button.xml`
- `android/app/src/main/res/xml/journal_launcher_widget_info.xml`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/res/values/strings.xml`

### iOS

- `modules/expo-widgets/ios/ExpoWidgetsModule.swift`
- `modules/expo-widgets/templates/ios/*`
- `plugins/withJournalLauncherWidget.js`
- `ios/FullFrillsBalanceWidget/FullFrillsBalanceWidget.swift`
- `ios/FullFrillsBalanceWidget/FullFrillsBalanceWidget-Info.plist`
- `ios/FullFrillsBalance.xcodeproj/project.pbxproj`

## Runtime Flow

1. User taps `Income`, `Expense`, or `Transfer` on the widget.
2. Native widget launches the app with the matching typed deep link.
3. Expo Router resolves `journal-entry`.
4. Existing journal entry screen opens in simple mode with the selected type.

## Validation Notes

- `npx expo config --type introspect` succeeds with the custom widget plugin enabled.
- Xcode project parsing passes and the widget target is visible to `xcodebuild -list`.
- TypeScript repo-wide compile currently fails because of unrelated pre-existing errors outside the widget work.
- Android Kotlin compile could not be run in this environment because Java is not installed.
- A full clean `expo prebuild` regeneration was not run in this workspace during validation, so that should be the next local verification step on your machine.

## Next Iterations

### Account-prefilled widgets

Possible once we decide on UX:

- `sourceAccountId`
- `destinationAccountId`

That would allow one-tap launch into a partially seeded journal form.

### Rich data widgets

If we later want balances or recent-account shortcuts on the widget itself:

- Android would need widget data refresh logic
- iOS would likely need App Groups for shared data access
- the app would need an explicit widget refresh trigger after relevant writes
- the `expo-widgets` module is the intended home for those runtime APIs
