---
description: Safely update and roll back the remote app-version policy
---

# Update Policy Workflow

Use this workflow when changing the version policy consumed by the iOS and Android app update gate.

## 1. Configuration Ownership

- Edit the separate repository: `SahilSoniOrg/full-frills-balance-configs`.
- The live file is `version-policy.json` on the `main` branch.
- The app reads the complete manifest from GitHub Raw. Do not add query parameters, platform parameters, or secrets to the URL.
- Live endpoint:
  `https://raw.githubusercontent.com/SahilSoniOrg/full-frills-balance-configs/main/version-policy.json`

The app repository only owns the endpoint wiring. The config repository owns policy values.

## 2. Manifest Contract

The file must contain all three platform objects:

```json
{
  "ios": { "minimumBuild": 0, "latestBuild": 0, "storeUrl": "https://…", "enabled": false },
  "android": { "minimumBuild": 0, "latestBuild": 0, "storeUrl": "https://…", "enabled": false },
  "web": { "minimumBuild": 0, "latestBuild": 0, "storeUrl": "https://…", "enabled": false }
}
```

Required fields per platform:

- `minimumBuild`: non-negative integer.
- `storeUrl`: absolute `http` or `https` URL.

Optional fields:

- `latestBuild`: integer greater than or equal to `minimumBuild`.
- `message`: mandatory-gate copy.
- `availableMessage`: optional-update copy.
- `enabled`: boolean; omitted means enabled.

Keep the full object for every platform in every change, even when only one platform is changing.

## 3. Runtime Semantics

- `enabled: false` disables enforcement and optional-update notices for that platform.
- If enforcement is enabled and the installed native build is below `minimumBuild`, the app blocks and offers **Update now** plus backup export.
- If the installed build is allowed but below `latestBuild`, the app shows a dismissible update notice.
- If the installed build is equal to or above `latestBuild`, no optional-update notice is shown.
- If `latestBuild` is lower than the installed build, the app remains allowed and shows no notice. This is safe during a release rollback or delayed rollout.
- A failed remote request falls back to a valid cached manifest; without a valid cache, the app fails open.
- Web remains present in the manifest for cross-platform completeness. Current web behavior does not enforce this policy.

## 4. Normal Release Procedure

1. Confirm the store release is available to users before enforcing it.
2. Determine the native build number from the shipped iOS or Android artifact. Do not use the marketing version.
3. Set `latestBuild` to the newly released build.
4. Set `minimumBuild` to the oldest build that should remain usable.
5. Set platform-specific `storeUrl` values and review user-facing copy.
6. Keep `enabled: false` for platforms that are not ready for enforcement.
7. Validate the complete JSON locally and review the diff for all three platforms.
8. Commit with a clear message, for example:
   `policy: require build 42 on ios`
9. Push to `main`.
10. Fetch the raw URL and verify the published response contains the intended commit values.
11. Monitor the app. GitHub Raw or an intermediate CDN may briefly serve the previous file.

## 5. Staged Enforcement

Use this sequence for a risky rollout:

1. Publish `latestBuild` with `enabled: true` and leave `minimumBuild` at the current supported floor. This tests the optional notice path.
2. Confirm the store action opens correctly on iOS and Android.
3. Raise `minimumBuild` only after the new build is broadly available in the relevant store.
4. Enable platforms independently when their store rollout and URLs are verified.

Never raise `minimumBuild` above a build that users can actually download.

## 6. Rollback Procedure

If a release is broken or unavailable:

1. Lower `minimumBuild` to the last known-good supported build, or set `enabled: false` for the affected platform.
2. Remove or lower `latestBuild` if the optional notice points to an unusable release.
3. Preserve valid store URLs and the complete three-platform manifest.
4. Commit and push the rollback immediately.
5. Verify the raw endpoint and wait for cache propagation.

Do not delete fields, publish malformed JSON, or point users at a private repository as a rollback.

## 7. Validation Checklist

Before pushing:

- JSON parses successfully.
- `ios`, `android`, and `web` are all present.
- Every `minimumBuild` is a non-negative integer.
- Every present `latestBuild` is an integer and is not below `minimumBuild`.
- Every `storeUrl` is an absolute `http` or `https` URL.
- `enabled` is explicitly reviewed for each platform.
- `minimumBuild` is not ahead of store availability.
- Copy does not claim an update is available unless `latestBuild` is set correctly.
- The raw GitHub URL returns the committed manifest after push.

The app-side verification remains the final safety net: malformed remote data is rejected, cached valid data is preferred during outages, and no valid policy means the app continues normally.
