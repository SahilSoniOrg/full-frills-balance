# Mobile Release: Build and Publish

How to ship Android and iOS builds from any checkout, with or without EAS doing the work.

---

## 1. What lives where

Release builds always go through EAS (`eas build`, cloud or `--local`). Uploading to a store can skip EAS.

| Thing | Lives in | Notes |
| --- | --- | --- |
| Android upload keystore | EAS credentials | Play App Signing re-signs uploads. A plain Gradle release build is signed with the debug key and Play rejects it. |
| iOS certificates and profiles | EAS credentials | |
| Version and build numbers | EAS (`appVersionSource: remote`, `autoIncrement`) | |
| Production env (`EXPO_PUBLIC_*`) | EAS environment variables, per environment | `.env.local` is for local dev only. Release builds don't read it. |
| Play service account key (EAS upload) | EAS credentials | `full-frills-balance@bright-raceway-268915.iam.gserviceaccount.com`. Used by `eas submit`. |
| Play service account key (direct upload) | Local file, gitignored | `google-services.json` in the repo root, or `PLAY_SERVICE_ACCOUNT_KEY_PATH`. EAS can't hand this back, so share it privately (for example, a password manager) or create a new key for the same service account in Google Cloud. |
| App Store Connect API key (direct upload) | Local file | `AuthKey_<id>.p8` |

Never commit key files.

---

## 2. One-time setup on a new machine

```bash
git clone <repo> && cd full-frills-balance
bun install
npm i -g eas-cli
eas login
```

Local builds also need the Android SDK and a JDK (Android), or Xcode (iOS).

---

## 3. Android

Every path below uploads to the **internal** track (`eas.json` → `submit.production.android.track`). Promote to production in the Play Console.

| Build | Upload | Command | Extra requirements |
| --- | --- | --- | --- |
| EAS | EAS | `bun run android:publish --build cloud` | None |
| Local | EAS | `bun run android:publish` | Android toolchain |
| EAS | Direct to Play | `bun run android:publish --build cloud --submit direct` | Play key file |
| Local | Direct to Play | `bun run android:publish --submit direct` | Android toolchain, Play key file |

- The bundle is written to `./build-android.aab`. The script refuses to upload a bundle without the embedded R8 mapping.
- To upload an existing `./build-android.aab` again without rebuilding: `bun run android:submit:local` (override the paths with `ANDROID_AAB_PATH` and `PLAY_SERVICE_ACCOUNT_KEY_PATH`).
- Direct upload ([`scripts/submit-android-local.mjs`](../../scripts/submit-android-local.mjs)) uses Google's edits flow, like fastlane `supply`: create an edit, upload the bundle (resumable upload), set the track, then commit.
- Direct upload stops with an error if other changes are still in Google review, rather than cancelling that review. Wait for the review to finish, or upload through EAS.
- `bun run android:release` only installs the production variant on a device for testing. It is not a Play build.

---

## 4. iOS

| Build | Upload | Commands |
| --- | --- | --- |
| EAS | EAS | `bun run ios:build:eas`, then `bun run ios:submit:eas` |
| Local | Direct to App Store Connect | `bun run ios:build:local`, then `bun run ios:submit:local` |

- A local build writes `./build-ios.ipa` and `./build-ios.ipa.sha256`.
- Direct upload ([`scripts/submit-ios-local.mjs`](../../scripts/submit-ios-local.mjs)) needs `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, and the `.p8` key. Set the key's path in `ASC_API_KEY_PATH`, or put the key in `API_PRIVATE_KEYS_DIR` or altool's default key folder.

---

## 5. Google Sign-In (Gmail) client IDs

The production OAuth clients are the ones under Google verification. Don't change them, their scopes, or their publishing status (see [google-oauth-gmail-verification.md](google-oauth-gmail-verification.md)).

| EAS environment | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| --- | --- | --- |
| production | `…-g7o1p78v41s70nip1a32mltq41gg9df3` | iOS Production `…-tc8lss33d0mlqf38fdpb2d7eeaftojh0` |
| development, preview | `…-g7o1p78v41s70nip1a32mltq41gg9df3` | iOS Dev `…-oi7vgrbq7eh3cmnhohcl2dr17os3soto` |

- Both platforms use the web client ID. Android clients are matched by package name and SHA-1, so the app doesn't need their IDs.
- `ios/` is committed, so EAS doesn't run prebuild. Both reversed iOS client IDs (`com.googleusercontent.apps.<id>`) are declared in `app.config.ts` for prebuild and kept in `ios/FullFrillsBalance/Info.plist` for builds from the committed native project. Keep both lists in sync when adding or changing an iOS client.
- The Android preview package (`.preview`) has no OAuth client, so Gmail sign-in doesn't work on preview builds.
