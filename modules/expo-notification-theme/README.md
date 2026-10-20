# Android notification theme

The main app uses this local Expo module to render SMS reviews, journal reminders, and Settings test notifications with colored content panels. Other notification types retain Expo's standard layout.

The module registers a notification-event receiver with higher priority than Expo's default receiver. It inherits Expo's scheduling, delivery, dismissal, and response handling, and overrides only the presentation delegate. The delegate builds the original Expo notification first, then recovers that builder to add native `RemoteViews`. This preserves the original tap intent, Expo request metadata, notification identity, channel, sound settings, and actions. Expo's existing boot and package-update receiver remains registered so scheduled reminders continue to be restored.

Both collapsed and expanded content have a tinted panel. Detailed spending reviews use peach/coral; income reviews use mint. Generic reviews, grouped notifications, reminders, and tests use a neutral surface. Light and dark resources follow Android's system appearance. At larger font sizes the collapsed view hides its secondary line; expanding shows the body.

Expanded detailed reviews separate the direction, review status, prominent amount, merchant/person, account, and suggested category. Income counterparties are prefixed with "From". Missing categories are explicitly labelled. Compact notifications show the amount/direction and counterparty/review status. If a title does not use the known amount-and-direction wording, it remains intact. The original title and body are retained in Expo's notification metadata. A dedicated monochrome chart icon replaces the launcher image in the system notification header.

`notificationTone` is added to the Android routing metadata only when transaction details are allowed and the alert is ungrouped. The native renderer independently checks those flags before selecting an expense or income appearance. Amounts, merchant names, and account names remain in the existing display text rather than being duplicated into routing data.

## Review actions and privacy

Detailed, ungrouped Android alerts offer **Ignore**, and **Log transaction** only for fully parsed, positive, same-currency income/expense reviews with valid rule-suggested source and category accounts. Transfers, missing/archived accounts, duplicate candidates, and SMS already consumed in another workplace require the existing editor. A digest of the displayed review and account suggestions prevents a stale Log action from saving changed details.

Both actions foreground the app and wait for launch, hydration, navigation, workplace selection, and app unlock. They are not headless background writes. Android 12+ also requires device authentication for the native actions. The action handler re-reads the record and accounts before writing through the existing journal validation and atomic SMS-linking boundary. Repeated Log responses cannot create a second linked journal. Ignore has an in-app Undo toast; logging does not automatically delete a saved journal on Undo. Failed actions show an error and open the exact review rather than silently retrying a financial write.

Generic/private and grouped notifications do not offer quick actions or expose transaction details. SMS notifications supply a generic Android public version for lock screens that hide sensitive content; the user controls system lock-screen visibility. Clearing a notification does not ignore the transaction. Existing inbox reconciliation removes alerts once their reviews are handled, and unresolved work remains in the SMS inbox. Grouped alerts intentionally retain a private count instead of the sample's detailed transaction list.

## Verify on an AVD or device

Rebuild the main Android app after pulling this change:

```sh
bun run android
```

A Metro reload or an OTA JavaScript update cannot install the native module. Expo Go cannot load it either.

1. In the main app's notification settings, send a test notification. It should have a neutral content panel even when collapsed.
2. Enable SMS notification details and receive a spending SMS, then an income SMS. Check peach and mint panels, expand each notification, and tap through to its review. With a review rule supplying same-currency source/category accounts, check Log and Ignore; without a category, only Ignore should appear. Ignore and then Undo in the app; log a separate review and verify exactly one journal is created.
3. Disable details, enable privacy mode, or enable app lock. New reviews must show generic text and the neutral brand appearance, without a direction-specific icon.
4. Repeat in system light and dark modes, and with a larger system font size. Confirm that scheduled reminders and clearing reviewed alerts still work.
5. Test actions after force-closing the app and with a different workplace selected. Change a suggested account after an alert arrives: Log must fall back to the editor. Verify device/app unlock before any write, and that lock-screen previews configured to hide sensitive content show no amount or merchant.

Android owns the outer notification card, header, and expansion control. The custom colors apply to the content area inside that template.
