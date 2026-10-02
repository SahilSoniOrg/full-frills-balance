Privacy Policy for Full Frills Balance

Effective Date: October 4, 2026

Last Updated: October 4, 2026

Public copy: https://full-frills-landing.vercel.app/privacy.html

Welcome to Full Frills Balance. This Privacy Policy explains how Full Frills Balance handles your information and protects your privacy.

Policy update (October 4, 2026): This update explains optional automatic SMS import on Android, including inbox checks at app startup and when new messages arrive. It also explains local retention of original transaction SMS for journal details, privacy-preserving maintenance, and allowlisted diagnostic and analytics practices. The September 7 update's local-first and future-sync statements remain in force; planned sync behavior does not mean that feature is available today.

1. Overview

Full Frills Balance is designed primarily as an offline personal money management application. It does not connect to bank accounts; financial records are based on information you enter or files you choose to import.

Most financial data entered or generated inside the app remains stored locally on your device and is not uploaded to external servers.

2. Financial Data Stored Locally

The following data is stored only on your device:

income and expense entries

balances

journals

account names

categories

transaction descriptions

imported transaction records

rule-based tagging preferences

We do not store this financial data on our own servers.

The app may also store the version of this Privacy Policy you acknowledged and the acknowledgement time. That local record is the app's acknowledgement state and remains on your device. If product analytics is enabled, the app may send a best-effort pseudonymous acknowledgement event to PostHog with the policy version as its event-specific data, alongside the standard analytics and device context described below. This telemetry is not a signed legal record. It does not send the policy text, a signature, or your financial records.

3. SMS Access and Transaction Import

On Android, Full Frills Balance may request SMS permissions to automatically check incoming messages for transaction details. Automatic SMS import is optional and starts only after you enable it in Settings.

SMS access is used only to:

scan your inbox when you manually start an import

read incoming SMS messages while automatic import is enabled

detect whether a message is transaction-related

extract transaction details such as amount, sender, and transaction type

create transaction entries inside the app

SMS scanning and parsing happen on your device. The first time you enable automatic import, the app scans up to 50 recent inbox messages as an initial catch-up. Matching transaction messages enter the SMS import flow and may be auto-posted under rules you configured. While automatic import is enabled, the app checks every incoming SMS locally to determine whether it contains a transaction, including messages it later ignores. Android may start a short background task when an SMS arrives, even if the app is not open. The app also checks for missed messages at startup and when it returns to the foreground. Android may delay background work while the app is force-stopped or restricted; the app catches up when it can run again. Disabling automatic import stops future arrival-triggered processing.

For transaction-related messages captured in the SMS inbox, the app retains the sender and original message body locally, including after review, dismissal, import, or auto-posting. Linked journal details can display that source message so you can check the transaction against the original SMS. New captures keep the original message in the shared Device inbox; workplace records and journals reference it instead of making additional raw copies. Older inbox records and journal metadata may retain existing source content. Imported financial entries also retain extracted details such as amount, currency, merchant, and reference number, plus a one-way deduplication digest. Privacy maintenance hashes older deduplication identities and removes raw SMS fields from machine-generated audit payloads; it does not erase retained source messages or user-written notes. New SMS imports do not copy raw messages into journal notes, audit fields, or analytics.

SMS review notifications are optional and scheduled locally on your device. Their enablement and detail-preview settings apply to this device and are not included in exported backups. By default they contain a generic review prompt. You can choose detailed previews with extracted transaction information; the app hides these details while Privacy Mode or app lock is enabled. Notification routing uses local inbox and workplace identifiers rather than raw SMS content. The pending inbox is shared on the device; posting, dismissing, and rule decisions belong to each workplace.

SMS permissions are optional, and the app remains usable without granting SMS access or enabling automatic import. Automatic import requires Android's SMS read and receive permissions.

We do not intentionally upload full SMS content, sender details, or message bodies to external servers.

Retained SMS source content has no automatic expiry. Importing, auto-posting, dismissing a message, or disabling automatic import does not delete it. It remains until you clear the app data, use Factory Reset, or uninstall the app. Privacy Mode hides the original SMS body in journal details. Backups you explicitly export may include original SMS content associated with the exported workplace records, including older journal source fields; the shared Device pending feed is not part of a workplace backup. These files remain under your control and are not encrypted by the app. Clearing app data does not delete backup files you previously saved or shared. SMS rule configuration may retain conditions you chose.

4. Analytics and Telemetry

We use PostHog and Expo Insights for product analytics and technical improvement.

Analytics may include only allowlisted event fields and values, including:

pages visited inside the app

onboarding completion

journal and budget creation (event counts only, not monetary values)

import and export actions (counts and formats, not row contents)

SMS import setting changes (enabled or disabled) and whether an SMS rule auto-posted a transaction (boolean values only)

in-app account creation events (account type and currency code only)

selected currency preference

app version, build, and variant

operating system name and version, and tablet flag

pseudonymous analytics identifiers

privacy policy acknowledgement events (policy version as event-specific data)

We do not intentionally send:

transaction or budget amounts

conversion or funnel monetary values

merchant names

SMS text

balances

user-entered notes

privacy policy text or signatures

Analytics identifiers are pseudonymous and are used only to understand app usage and improve functionality.

PostHog session replay is disabled. We do not record in-app screenshots or screen replays for product analytics.

**Sentry (crash reporting)** is separate from PostHog. When enabled, error reports and performance traces may include error types, code locations (function names, file paths and line numbers from the app's own code), and navigation timing; error message text is removed before sending. Native crash reporting is disabled because its reports bypass the JavaScript privacy filters. Native crashes, freezes and out-of-memory terminations are not reported through the native SDK. We do not attach screenshots or screen layouts, and we do not enable Sentry session replay or screen recording.

5. Internet Use

Although Full Frills Balance is primarily offline, internet access is used for limited features:

retrieving currency exchange rates from ExchangeRate-API

sending analytics telemetry

Exchange-rate requests do not include your transaction history or personal financial records.

6. Export and Backup

You may export app data as ZIP backup files containing your personal records.

Exported files remain under your control on your device.

Backups are not encrypted by the app, so you are responsible for protecting exported files.

7. No Account Registration

Currently, Full Frills Balance does not require:

login

email registration

phone number verification

cloud account

8. Data Sharing

We do not sell personal data.

Limited technical analytics may be processed by third-party providers strictly for app improvement.

9. Permissions

Depending on features you choose to use, the app may request:

SMS permission for transaction import

storage access for export and backup

Permissions are optional where possible and used only for app functionality.

10. Planned Future Online Features (Not Currently Available)

The current app does not offer account registration, online sync, or cloud backup. Future versions may offer optional encrypted backup or multi-device sync. If introduced, the intended privacy principles are:

- sync requires a separate, clear opt-in after a notice explains what categories of data would be uploaded and why
- declining sync keeps local use available
- financial records are encrypted on your device before upload; the service is designed to store ciphertext without the keys needed to read the financial content
- sync uses encrypted operations or snapshots rather than uploading the raw local database; balances, reports, and other derived views are rebuilt locally
- sync is limited to the workspace you choose, but the service may still process account, device, membership, operation-size, timing, and security metadata needed to authenticate, authorize, route, and operate the service
- recovery methods, device enrollment and revocation, key changes, retention, and deletion are explained before sync is activated
- encryption and recovery keys are intended to remain under your control; losing your devices and recovery method may make synced books unrecoverable
- raw SMS text is not uploaded or parsed on the server, and server-side tax, legal, or financial-reporting workflows are not part of the planned sync design

If online sync is introduced, this Privacy Policy and the in-app disclosure will be updated before the feature is enabled. Stopping sync would stop future uploads, but it would not automatically recall data already downloaded to a device or delete a server backup unless a separate deletion process is completed.

11. Security

Your financial records remain primarily on your own device.

You are responsible for securing your device and exported backup files.

12. Children’s Privacy

Full Frills Balance is not directed to children. If you are below the age at which you can provide valid consent under the law that applies to you, use the app only with a parent or legal guardian involved.

13. Privacy Requests and Contact

Your local financial records are stored on your device, so we generally cannot access or recover them from our servers. Use the app’s Settings controls for export, restore, and factory reset.

For data processed by Full Frills Balance or its service providers, you may contact us about privacy questions or requests such as access, correction, deletion, or withdrawal of consent where applicable. We may need to verify a request and may retain information where required by law.

Sahil Soni

sscsps@gmail.com

14. Changes to This Policy

This Privacy Policy may be updated when app features or data practices change. When an update materially changes how data is handled, we will update the effective and last-updated dates and provide an in-app or other appropriate notice where practical.

Update history:

- October 4, 2026 — documented optional automatic SMS import on Android at startup and on new-message arrival; documented retention of original transaction SMS for journal details and user-controlled backups, privacy maintenance, and allowlisted diagnostics and analytics.
- September 7, 2026 — clarified current local-first and no-bank behavior, export files, analytics and crash reporting, and planned privacy principles for optional encrypted sync. No sync feature was enabled by this update.
- March 5, 2026 — initial policy published.
