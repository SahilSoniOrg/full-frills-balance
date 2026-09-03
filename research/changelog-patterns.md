# Changelog patterns for app updates

## Findings

### 1. Store-level notes are the baseline, but are not enough

Apple exposes a localized “What’s New in this Version” field on every version after the first. Apple describes it as a place for new features, UI improvements, and bug fixes, with a 4,000-character limit. It is part of the version metadata shown to customers around an update. [Apple: Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

Google Play similarly treats release notes as part of a release and keeps a list of previous release notes in Play Console. Once an update is available, users can download it from the store listing or their updates page. [Google Play: Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en), [Google Play: Update or unpublish your app](https://support.google.com/googleplay/android-developer/answer/9859350?hl=en)

### 2. A browsable history is the durable pattern

Notion maintains a dedicated “What’s New” page with dated entries, concise descriptions, and richer media for selected changes. This gives users a place to discover changes after updating, rather than relying only on a one-time prompt. [Notion: What’s New](https://www.notion.com/releases)

### 3. The useful pattern for Full Frills

Use two layers:

1. The update gate shows a short, version-specific summary before a mandatory update. This is actionable context and should stay available even when the app is blocked.
2. Settings → About & Support → Release notes opens the canonical Telegram post/history. This is the durable archive and can contain screenshots, discussion, and older releases.

The app-side copy should remain short and structured as bullets. The Telegram link should be an explicit external destination, not an embedded web view: it keeps the app small, avoids duplicating the canonical notes, and lets the community discussion remain in Telegram.

## Recommendation

Keep the new `VersionPolicy.changelog` field for the update-gate preview. Add a permanent Settings entry that opens the Telegram release-notes message. For each release, populate the gate with 3–6 user-facing bullets and publish the fuller narrative in Telegram. Avoid showing the same gate modal automatically after every successful update; that creates interruption and is redundant with the Settings archive.
