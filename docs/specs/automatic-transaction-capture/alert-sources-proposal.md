# Bank alert capture on iOS and Android

Draft for product review · 2026-11-22

Add automatic capture on iOS without taking on a paid Gmail security assessment. Start with bank texts delivered through Apple Shortcuts. Add bank-app notifications on Android for banks whose push alerts contain usable transaction details. Extend the iOS action to email alerts through Apple Mail once SMS delivery is proven. Eligible alerts appear in the existing Transaction inbox for review. [Automatic transaction capture](spec.md)

## iOS bank text capture

1. In **Settings → Transactions → Capture & review**, the user opens **Bank texts via Shortcuts** and goes straight to instructions for creating the automation, choosing a phrase from a real bank alert, and enabling automatic execution. The shortcut is set up for the Device and carries no Workplace ID.
2. Shortcuts runs **Capture bank alert** on each matching new message. The action accepts the alert text, source, and any sender or arrival information Shortcuts supplies. It hands the alert to local intake without opening the app. If processing waits for the app to open, the handoff must survive process termination and retries must resolve to the same Device inbox record.
3. Eligible texts enter the shared **Device inbox** as SMS observations. The same observation is available from every Workplace. Show the time of the first alert received from the automation so users can confirm it works. Until then, show **Waiting for first alert**. An optional preview from pasted sample text can confirm parsing during setup.

Native Android SMS already follows this ownership model. Its scanner uses the active Workplace for review context, and the Device inbox stores one source observation. When a Workplace consumes that observation by posting or linking it to a journal or by dismissing it, the repository records a copy for that Workplace. The Transaction inbox derives its elsewhere-consumed labels from those copies. Other Workplaces can still consume the same observation manually. The active Workplace can affect review suggestions without claiming ownership of the source. [SMS scanner](../../../src/services/sms/AutomaticSmsImportService.ts#L100) · [Device inbox storage](../../../src/data/repositories/DeviceSmsInboxRepository.ts#L214) · [Workplace copies](../../../src/data/repositories/TransactionInboxRepository.ts#L652) · [Inbox projection](../../../src/data/repositories/TransactionInboxRepository.ts#L93)

Leave the sender unset when a phrase is sufficient. A single-space filter can cover multiple banks, but also passes personal texts containing spaces. Offer it as an explicit **All banks** option after testing common alert formats and discarding unrelated text locally. Use bank-specific phrases as the default. TrackExpenses documents phrase-based setup and passing the message body. arc documents a shareable automation with the single-space filter on iOS 27. Check whether a shareable setup works for Full Frills Balance before relying on it. [Apple communication triggers](https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios) · [TrackExpenses SMS setup](https://trackexpenses.app/guides/sms-setup.html) · [arc bank text setup](https://arc.moi/docs/automatic-logging/bank-sms/)

## Android bank-app notification capture

Keep the existing native SMS capture. Offer bank-app notifications as a separate, optional source. Explain that Android grants broad Notification access, let the user select supported bank apps, and obtain consent before opening Android Settings. Process notifications only from the selected apps and only for the configured Workplace. Use the notification's package to identify the source app. [Existing Android SMS receiver](../../../modules/expo-sms-inbox/android/src/main/java/expo/modules/smsinbox/IncomingSmsReceiver.kt) · [Android notification listener](https://developer.android.com/reference/android/service/notification/NotificationListenerService) · [Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)

A bank may publish a generic or truncated preview, suppress a notification, or reuse the same notification for several events. Support a bank app only after checking its actual payloads. Treat incomplete alerts as insufficient evidence for a transaction draft. Start with bank apps. Gmail previews would need their own coverage check, and SMS app notifications remain outside this flow under Play's restricted SMS rules. The listener uses Android's user-granted access and no Gmail OAuth scope. No separate certification is listed for this API in the reviewed requirements. [Play sensitive permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241) · [Google restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

## Later email support on iOS

The user adds Gmail or another supported account to Apple Mail and creates an **Email** automation with a bank sender or subject filter. Shortcuts passes the matching email body to **Capture bank alert**. Apple Mail handles mailbox sign-in and retrieval. Full Frills Balance receives the selected alert text and requests no Gmail OAuth scope for this path. The feature covers new alerts and inherits Mail's fetch timing. [Apple email triggers](https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios) · [TrackExpenses bank email setup](https://trackexpenses.app/guides/bank-email-alerts-iphone.html)

Revisit direct mailbox sync if users need email backfill or Mail setup prevents adoption. Treat the existing `gmail.readonly` connection and its verification as a separate product decision. Android email remains a future decision because notification previews provide variable coverage. [Gmail OAuth runbook](../../operations/google-oauth-gmail-verification.md)

## Review, privacy, and duplicate handling

- Route every new source through the existing Transaction inbox and journal review. The first release records no journal until the user confirms it. Show the source on each review item. For Shortcut SMS, the Workplace consumption label appears when a Workplace imports, links, or dismisses the item.
- Parse locally. Apply the existing SMS ignore and review rules to Shortcut texts, including incomplete alerts. Remove temporary delivery files after handling them. Keep alert contents out of analytics and crash reporting. Document what the app retains and how to disable each source.
- Use stable source identity where available to avoid creating a second draft on replay. An SMS, email, and notification can describe the same movement. Use existing reference and duplicate checks where the evidence supports them. Flag ambiguous matches for review and preserve distinct purchases that happen to share an amount or merchant. [Capture and provenance rules](spec.md) · [Shared extraction used by Gmail](../../../src/services/email/parseGmailTransaction.ts)
- For Shortcut SMS, the original receipt timestamp helps identify repeated deliveries. When Shortcuts omits it, a replay beyond the existing redelivery window can create another review item. Explain this during setup and require manual confirmation before either item can affect the books.
- Factory Reset stages a new Shortcuts queue and activates it when the database reset commits. If reset fails, the previous queue stays active. Startup reconciles interrupted resets and retries deletion of retired files, including before a new Workplace exists.

## Rollout criteria

| Stage | Evidence required |
| --- | --- |
| iOS SMS pilot | Set up the shortcut with one Workplace open, switch to another, and receive a real bank SMS while the iPhone is locked and Full Frills Balance is off-screen. Confirm that both Workplaces show the same pending Device inbox item. Consume it in one Workplace and confirm that the other shows the consumption label and can still act manually. Verify input wiring, retry behavior, and setup status before enabling it broadly. |
| Android notifications pilot | Representative alerts from each supported banking app create usable drafts. Redelivered or updated notifications avoid duplicate drafts. Disabling capture or revoking access stops new intake. |
| iOS email pilot | A filtered Gmail alert in Apple Mail arrives with enough text to parse the transaction. Verify locked-device delivery, delayed Mail fetch, and an SMS plus an email for the same purchase. |

For each pilot, include successful debits and credits along with declined payments, authentication codes, truncated alerts and unrelated text. Support a source when a user can complete setup, confirm delivery with their own bank, and identify what happened when a draft fails to appear.
