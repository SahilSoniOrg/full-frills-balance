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

## ExpoModulesCore / Swift compiler crash

`expo-modules-core@58.0.26.patch` removes the redundant `as any Error` cast
from the failure pattern inside the consuming Result switch in
`AsyncFunctionDefinition.build`. The failure value already conforms to Error;
promise rejection and noncopyable success-value ownership remain unchanged.

The original pattern crashes Swift's SILGen when ExpoModulesCore is compiled
from source. This was reproduced locally with Xcode 27.2 / Swift 6.4.2; removing
the cast lets the minimal reproducer compile. References:
[Expo #52231](https://github.com/expo/expo/issues/52231) and
[Swift #93625](https://github.com/swiftlang/swift/issues/93625).

Bun applies the patch through `patchedDependencies`. Keep it with `bun.lock`;
recheck and remove it when an ExpoModulesCore upgrade includes the workaround
or the supported compiler no longer reproduces the crash.
