Privacy Policy for Full Frills Balance

Effective Date: November 9, 2026

Last Updated: November 9, 2026

Public copy: https://full-frills-landing.vercel.app/privacy.html

Welcome to Full Frills Balance. This Privacy Policy explains how Full Frills Balance handles your information and protects your privacy.

Policy update (November 9, 2026): This update explains optional Google sign-in and Gmail read-only access for transaction email capture, including on-device Inbox checks and parsing, locally retained matched-email details, optional automatic and background capture, how disconnecting and dismissing affect saved data, and how to remove local records. The October 4 update's SMS and analytics disclosures remain in force.

1. Overview

Full Frills Balance is designed primarily as an offline personal money management application. It does not connect to bank accounts; financial records are based on information you enter, SMS messages you choose to import, files you choose to import, or transaction emails you choose to connect.

Most financial data entered or generated inside the app remains stored locally on your device and is not uploaded to external servers.

2. Financial Data Stored Locally

The following data is stored only on your device:

income and expense entries

balances

journals

account names

categories

transaction descriptions

imported transaction records, including selected details from matched Gmail messages

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

4. Gmail Access and Transaction Email Import

On supported iOS and Android devices, you may connect a Google account and grant Full Frills Balance the Google `gmail.readonly` permission. This permission can read messages across your Gmail mailbox, not only transaction emails. The app's capture search is limited to Inbox messages received after you connect it to a Workplace, and it may inspect unrelated Inbox messages on your device while matching. Google does not offer a read-only permission limited to transaction emails. Connecting Gmail is optional. The app remains usable without it. Automatic transaction capture and background Gmail checks on supported devices are separate optional settings.

When Gmail is connected, the app checks Inbox messages received after you connect Gmail for a Workplace. It may inspect messages unrelated to transactions to decide whether they match. The app reads message sender, subject, received time, message identifiers, and message text for this on-device check. For a matched transaction email, it processes the content on your device to identify transaction direction, amount, currency, merchant, reference number, and possible account. A transaction goes to the local inbox for review unless you separately enable automatic capture and the message meets the app's verification and matching requirements. Automatic capture applies only to eligible messages received after you enable it.

The app does not send Gmail message content or your financial records to Full Frills Balance servers. Email parsing and transaction matching happen on your device. The app does not save the full email body as a transaction record. For a matched email, it stores selected details locally: sender, subject, received time, Gmail message identifiers, parsed transaction fields, processing status, and account-recognition details used for matching. These details are kept in the local transaction inbox and may also be present in related journal records and exported backups. Disconnecting Gmail or dismissing an inbox item does not delete its saved details. Gmail inbox items have no separate delete control; to remove those local records from this device, use Factory Reset or clear app data, which also removes other local app data. Enabled Apple or Android device backups may retain a copy of app data, including these details. Workplace backups you explicitly export may include saved transaction inbox and journal details; the app does not encrypt exported backups. Unmatched messages are not saved by the app. Message content temporarily fetched for parsing, previews, or signature checks is processed in memory and is not intentionally written to the app database, logs, or analytics.

Google processes sign-in and Gmail API requests under Google's own terms and privacy policy. The app uses Google's sign-in components and Gmail API directly from your device; analytics and crash-reporting providers do not receive Gmail bodies, sender details, subjects, access tokens, or parsed transaction content. Google's sign-in components provide and cache access credentials; the app does not write tokens to transaction records, logs, analytics, or exported backups. If you enable verified automatic capture, the app queries Google Public DNS with the sender domain and DKIM key selector to look up a public signing key; it does not send email content in that DNS request. The app stores a local association between the selected Workplace and Google account identifier, along with the Gmail history cursor and local capture settings.

You can turn off automatic capture and background checks in Gmail settings, or disconnect Gmail from a Workplace. Disconnecting stops future checks for that Workplace and removes its local connection and history cursor. If no other Workplace uses the same Google account, the app also asks Google Sign-In to revoke the app's access and signs out. Disconnecting does not erase transaction inbox details or journals already created. To remove saved Gmail inbox details from this device, use Factory Reset or clear app data; this also removes other local app data. You can review or revoke Google access from your Google Account security settings. Exported files and enabled device backups are managed separately and may retain copies.

5. Analytics and Telemetry

We use PostHog and Expo Insights for product analytics and technical improvement.

Analytics may include only allowlisted event fields and values, including:

pages visited inside the app

onboarding completion

journal and budget creation (event counts only, not monetary values)

import and export actions (counts and formats, not row contents)

SMS import setting changes (enabled or disabled) and whether an SMS rule auto-posted a transaction (boolean values only)

Gmail feature setting changes, sync success or failure, and counts of captured transactions (channel and counts only; no email content or parsed transaction values)

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

6. Internet Use

Although Full Frills Balance is primarily offline, internet access is used for limited features:

retrieving currency exchange rates from ExchangeRate-API

sending analytics telemetry

connecting to Google for sign-in and, only if you connect Gmail, reading Inbox messages for transaction capture

looking up email signature keys through Google Public DNS when verified Gmail automatic capture is enabled (sender domain and DKIM key selector only)

Exchange-rate requests do not include your transaction history or personal financial records.

7. Export and Backup

You may export app data as ZIP backup files containing your personal records.

Exported files remain under your control on your device.

Backups are not encrypted by the app, so you are responsible for protecting exported files.

If iCloud Backup or Android device backup is enabled, Apple or Android may include the app's local data in a backup associated with your account. This may include saved Gmail transaction details. These backups are controlled by your device and account settings, not by Full Frills Balance, and may retain copies after you clear app data or use Factory Reset. The app cannot access or remove those backup copies.

8. No Required App Account

Full Frills Balance does not require an app account or sign-in for ordinary local use. Gmail capture is optional and requires you to connect a Google account and grant Gmail read-only access. The app does not require:

login

email registration

phone number verification

cloud account

9. Data Sharing

We do not sell personal data.

Limited technical analytics may be processed by third-party providers strictly for app improvement. If you connect Gmail, Google processes sign-in and Gmail API requests so the app can read messages you authorize. When verified Gmail automatic capture is enabled, Google Public DNS receives the sender domain and DKIM key selector so the app can look up the email's public signing key; this lookup contains no email body or parsed transaction data. Full Frills Balance does not send Gmail message content or parsed transactions to its own servers or analytics providers.

10. Permissions

Depending on features you choose to use, the app may request:

SMS permission for transaction import

Google Public DNS lookups for sender domain and DKIM key selector, if you enable verified Gmail automatic capture

Google sign-in and Gmail read-only access, if you connect Gmail

storage access for export and backup

Permissions are optional where possible and used only for app functionality.

11. Planned Future Online Features (Not Currently Available)

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

12. Security

Your financial records and Gmail-derived transaction details remain on your own device.

You are responsible for securing your device and exported backup files.

13. Children’s Privacy

Full Frills Balance is not directed to children. If you are below the age at which you can provide valid consent under the law that applies to you, use the app only with a parent or legal guardian involved.

14. Privacy Requests and Contact

Your local financial records and Gmail-derived transaction details are stored on your device, so we generally cannot access or recover them from our servers. Use the app’s Settings controls for export, restore, factory reset, and Gmail disconnection. Disconnecting stops future checks but does not delete transaction records already saved locally. You can revoke Google access in your Google Account settings.

For data processed by Full Frills Balance or its service providers, you may contact us about privacy questions or requests such as access, correction, deletion, or withdrawal of consent where applicable. We may need to verify a request and may retain information where required by law.

Sahil Soni

sscsps@gmail.com

15. Changes to This Policy

This Privacy Policy may be updated when app features or data practices change. When an update materially changes how data is handled, we will update the effective and last-updated dates and provide an in-app or other appropriate notice where practical.

Update history:

- November 9, 2026 — documented optional Google sign-in and Gmail read-only access, on-device Inbox checks and transaction parsing, locally retained matched-email details, optional automatic and background capture, and the effect of disconnecting, dismissing, Factory Reset, and clearing app data.
- October 4, 2026 — documented optional automatic SMS import on Android at startup and on new-message arrival; documented retention of original transaction SMS for journal details and user-controlled backups, privacy maintenance, and allowlisted diagnostics and analytics.
- September 7, 2026 — clarified current local-first and no-bank behavior, export files, analytics and crash reporting, and planned privacy principles for optional encrypted sync. No sync feature was enabled by this update.
- March 5, 2026 — initial policy published.
