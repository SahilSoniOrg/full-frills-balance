# In-app update dependency patch

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
