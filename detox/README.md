# Detox (native iOS)

End-to-end tests on the **iOS Simulator** using a **development client** build. Playwright tests in `e2e/` still cover the web export.

## Prerequisites

- Xcode + iOS Simulator
- [applesimutils](https://github.com/wix/AppleSimulatorUtils) (Detox uses it to control the simulator):

  ```bash
  brew tap wix/brew
  brew trust wix/brew    # if Homebrew asks
  brew install applesimutils
  ```

- After an Xcode upgrade, refresh Detox’s iOS harness:

  ```bash
  npx detox clean-framework-cache && npx detox build-framework-cache
  ```

- Metro running for the dev client: `bun start` (port **8081**)

## One-time setup

After pulling Detox changes:

```bash
npx expo prebuild --platform ios   # Android: adds Detox gradle wiring via @config-plugins/detox
cd ios && pod install && cd ..
npx detox clean-framework-cache && npx detox build-framework-cache
bun run test:detox:build
```

`@config-plugins/detox` is in `app.config.ts` (mainly for **Android** network security). iOS uses the standard Debug simulator build in `.detoxrc.js`.

## Run tests

Terminal 1:

```bash
bun start
```

Terminal 2:

```bash
bun run test:detox
```

Optional simulator device (default `iPhone 17`):

```bash
DETOX_IOS_DEVICE="iPhone 17 Daily" bun run test:detox
```

## Record a demo video

```bash
bun start   # separate terminal
DETOX_RECORD_VIDEO=1 bun run test:detox:video
```

Videos land under `artifacts/detox/`.

## Troubleshooting

- **Stuck on Expo dev launcher**: Reload once in the simulator, or dismiss the dev menu, then re-run.
- **Cannot connect to Metro**: Ensure `bun start` is up; override with `DETOX_METRO_URL=http://YOUR_LAN_IP:8081`.
- **Build failures**: Run `bun run test:detox:build` alone and inspect `xcodebuild` output.
