# Dependency patches

## In-app updates

`sp-react-native-in-app-updates@2.0.0.patch` is applied by Bun through the
`patchedDependencies` entry in `package.json`. Keep it with `bun.lock`; a clean
`bun install --frozen-lockfile` must reproduce the patched package.

The patch adds the lifecycle behavior needed by the Android update adapter:

- Expose Play's install status so a completed download can be recovered after
  restarting the app.
- Allow an already-running immediate update to resume.
- Reject launch attempts without a foreground activity or when Play returns
  failure to start the flow.
- Return installation-completion failures to JavaScript instead of discarding
  them.
- Distinguish user cancellation from a failed activity result. An accepted flow
  is not proof of successful installation.
- Remove native and JavaScript listeners when their owners are disposed.

The codegen spec, source implementation, shipped JavaScript and declarations
are patched together. Review these changes when upgrading the dependency;
remove fixes only when the replacement package includes equivalent behavior.

Local native compilation and mocked delivery tests do not prove Play Store
eligibility. Validate delivery with two signed, increasing production builds
through Google Play. The lower build must already contain the updater.

## WatermelonDB / React Native 0.88

`@nozbe/watermelondb@0.28.1-0.patch` updates the iOS JSI installer to use the
runtime exposed by React Native's `RCTBridge` proxy. React Native 0.88 removed
`RCTCxxBridge`, which the published WatermelonDB package still references. The
patch is applied by Bun through `patchedDependencies`; keep it with `bun.lock`
and recheck it when upgrading either package.

## Drawer layout reduced motion

`react-native-drawer-layout@4.2.12.patch` adds a `reduceMotion` prop to the
drawer. The published package always animates on native
(`ReduceMotion.Never`) and always uses CSS transitions on web. With the patch,
`true` makes the drawer and backdrop open and close instantly, and leaving it
unset follows the system setting. The app passes `useReducedMotion()`, so the
Appearance toggle applies too. The patch is applied by Bun through
`patchedDependencies`; recheck it when upgrading the package or `expo-router`.

## Pager / enclosing drawer gestures on iOS

`react-native-pager-view@9.0.7.patch` makes the iOS pager's collection-view
pan wait for enclosing React Native Gesture Handler pans to fail. Without
that UIKit dependency, the native pager claims Dashboard edge swipes before
the drawer can activate. Dashboard now permits right-swipe opening across the
full page on native platforms. The drawer's direction and enabled constraints
decide when paging can proceed; vertical list scrolling keeps its own
recognizer. This native patch changes only iOS.

The dependency is installed after gesture handlers attach, and reapplied when
SwiftUI recreates the pager. It relies on RNGH's `RNBetterPanGestureRecognizer`
class name; recheck this patch when upgrading the pager or RNGH. Bun applies it
through `patchedDependencies`. A native iOS rebuild is required.

## File system / iOS photo library

`expo-file-system@58.0.13.patch` removes the unused iOS PhotoKit asset handlers.
They reference photo-library APIs and caused App Store upload warning ITMS-90683
when the app had no photo-library usage description. The app uses ordinary file
operations and does not request photo-library access. Recheck this patch when
upgrading the package; Bun applies it through `patchedDependencies`.
