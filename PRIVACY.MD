Privacy Policy for Full Frills Balance

Effective Date: September 7, 2026

Last Updated: September 7, 2026

Public copy: https://full-frills-landing.vercel.app/privacy.html

Welcome to Full Frills Balance. This Privacy Policy explains how Full Frills Balance handles your information and protects your privacy.

Policy update (September 7, 2026): This update clarifies that the current app is local-first, does not connect to bank accounts, and does not provide online sync or cloud backup. It also documents privacy principles for a possible future encrypted sync feature. The future-sync section describes planned behavior only; it does not mean that feature is available today.

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

Full Frills Balance may request SMS permission to help import financial transactions automatically.

SMS access is used only to:

read messages available on your device when you trigger import

detect whether a message is transaction-related

extract transaction details such as amount, sender, and transaction type

create transaction entries inside the app


All SMS processing currently happens only when the user manually starts import.

SMS permission is optional, and the app remains usable without granting SMS access.

We do not intentionally upload full SMS content, sender details, or message bodies to external servers.

Raw SMS content is not stored after processing, except where limited extracted data may be saved if you create app rules for tagging, account mapping, or transaction descriptions.

4. Analytics and Telemetry

We use PostHog and Expo Insights for product analytics and technical improvement.

Analytics may include:

pages visited inside the app

onboarding completion

journal and budget creation (event counts only, not monetary values)

import and export actions (counts and formats, not row contents)

in-app account creation events (account type and currency code only)

selected currency preference

app version, build, and variant

device model, device name, OS name and version, and tablet flag

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

**Sentry (crash reporting)** is separate from PostHog. When enabled, Sentry receives error reports and performance traces (for example stack traces and navigation timing). We do not enable Sentry session replay or screen recording.

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

Future versions may also include optional background transaction parsing on the device. If introduced, this Privacy Policy and the in-app disclosure will be updated before release.

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

- September 7, 2026 — clarified current local-first and no-bank behavior, export files, analytics and crash reporting, and planned privacy principles for optional encrypted sync. No sync feature was enabled by this update.
- March 5, 2026 — initial policy published.
