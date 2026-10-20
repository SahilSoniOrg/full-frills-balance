# Android notification theme

The main app uses this local Expo module to render SMS reviews, journal reminders, and Settings test notifications with colored content panels. Other notification types retain Expo's standard layout.

The module registers a notification-event receiver with higher priority than Expo's default receiver. It inherits Expo's scheduling, delivery, dismissal, and response handling, and overrides only the presentation delegate. The delegate builds the original Expo notification first, then recovers that builder to add native `RemoteViews`. This preserves the original tap intent, Expo request metadata, notification identity, channel, sound settings, and actions. Expo's existing boot and package-update receiver remains registered so scheduled reminders continue to be restored.

Both collapsed and expanded content have a tinted panel. Detailed spending reviews use coral; income reviews use mint. Generic reviews, grouped notifications, reminders, and tests use the neutral brand mint. Light and dark resources follow Android's system appearance. At larger font sizes the collapsed view hides its secondary line; expanding shows the body.

Expanded detailed reviews use a solid evergreen or rust surface, a small direction heading, a prominent amount, and a stronger primary detail line. Remaining account/category context has its own secondary line. The direction icon anchors the opposite side of the amount column. Compact notifications use the same high-contrast surfaces. A native review action replaces the inline tap instruction, using the original notification tap intent. If a title does not use the known amount-and-direction wording, it remains intact. The original title and body are retained in Expo's notification metadata. A dedicated monochrome chart icon replaces the launcher image in the system notification header.

`notificationTone` is added to the Android routing metadata only when transaction details are allowed and the alert is ungrouped. The native renderer independently checks those flags before selecting an expense or income appearance. Amounts, merchant names, and account names remain in the existing display text rather than being duplicated into routing data.

## Verify on an AVD or device

Rebuild the main Android app after pulling this change:

```sh
bun run android
```

A Metro reload or an OTA JavaScript update cannot install the native module. Expo Go cannot load it either.

1. In the main app's notification settings, send a test notification. It should have a mint content panel even when collapsed.
2. Enable SMS notification details and receive a spending SMS, then an income SMS. Check coral and mint panels, expand each notification, and tap through to its review.
3. Disable details, enable privacy mode, or enable app lock. New reviews must show generic text and the neutral brand appearance, without a direction-specific icon.
4. Repeat in system light and dark modes, and with a larger system font size. Confirm that scheduled reminders and clearing reviewed alerts still work.

Android owns the outer notification card, header, and expansion control. The custom colors apply to the content area inside that template.
