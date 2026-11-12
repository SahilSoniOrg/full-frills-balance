# App Store listing draft

For **Full Frills Balance**, bundle ID `in.sahilsoni.fullfrillsbalance`, version `1.0.0`.

## App Store Connect progress

Apple's App Store Connect Terms of Service were accepted after explicit approval. The app record is **6833898432**.

Saved in App Store Connect:

- Promotional text, description, keywords, support URL, and marketing URL.
- Subtitle and Finance primary category.
- Privacy policy URL.

The App Privacy questionnaire is saved in App Store Connect but remains unpublished. The production app sends analytics and diagnostics to PostHog and Sentry. The connected PostHog project confirms it receives IP addresses and adds approximate GeoIP fields; IP anonymization is off. The saved data types are Device ID, Product Interaction, Coarse Location, Crash Data, Performance Data, and Other Diagnostic Data. They are linked to the app installation's pseudonymous analytics ID, are not used for tracking, and are used for analytics or app functionality as applicable. Apple Speech Recognition may send voice audio to Apple for real-time transcription; the policy discloses this, but the app does not retain audio recordings. The in-app notice and landing-page source disclose voice handling and PostHog IP/GeoIP handling. The landing-page changes are local and not deployed, so publish the updated policy before publishing the App Privacy label.

The App Store version is set to `1.0.0`, matching the binary. The 4+ age rating and App Review contact are saved. Content Rights remains unanswered. EAS build 3 (`fd25920e-17bd-4b1a-8216-3f3b6f256d95`) predates the updated in-app voice disclosure; its upload succeeded, but TestFlight still showed no builds about 30 minutes later. Corrected build 4 (`925db3a8-fa64-4fdc-9f8c-55fdf06044ff`) included the updated disclosure. Apple then emailed ITMS-90683 for build 4: missing `NSPhotoLibraryUsageDescription`, because bundled SDKs referenced photo-library APIs despite the app having no photo feature. Build 5, which added a purpose string, was canceled. The intended policy is to request no photo-library access: the unused `expo-image` dependency and plugin are removed, and a persistent Bun patch removes `expo-file-system`'s iOS PhotoKit asset handlers while retaining regular file operations. CocoaPods was reinstalled from the patched package; `expo-image` and its image-codec pods are no longer linked. EAS build 6 (`f0c29540-d4df-4115-813f-53393d7da8e3`) finished successfully and was submitted to App Store Connect as `26556e4a-d0e3-4733-a425-12b01e51ff30`. Its EAS workflow (`01a1d106-2e8e-7991-a61e-6fc9e61e98c2`) remains `IN_PROGRESS` after 45 minutes, with no logs or errors and no new Apple notification. Do not retry the upload while this job remains active. Do not submit the version for App Review until the remaining decisions and assets are ready.

## App information

- **Name:** Full Frills Balance
- **Subtitle:** Double-entry money tracker
- **Promotional text:** A calmer way to manage money: every journal balances, plans stay visible, and your books stay on your device.
- **Primary category:** Finance
- **Privacy policy URL:** https://fullfrills.sahilsoni.in/privacy.html
- **Support URL:** https://t.me/FullFrills
- **Marketing URL:** https://fullfrills.sahilsoni.in/ (public homepage; currently says iOS is coming soon)
- **Keywords:** budget,ledger,accounting,bookkeeping,cash flow,net worth,expenses,transactions,spending

## Description

Keep your personal finances organized with a ledger that balances.

Full Frills Balance brings double-entry bookkeeping to a clear personal finance app. Record transactions, plan ahead, and understand your money without connecting a bank account. Your accounts and journals are stored on your device.

BALANCE EVERY JOURNAL
• Record income, spending, transfers, and adjustments.
• Track assets, liabilities, equity, income, and expenses in organized accounts.
• Use simple or multi-line entries with notes and categories.

SEE THE WHOLE PICTURE
• Follow net worth, recent activity, income versus spending, and category reports.
• Track accounts in multiple currencies with cached exchange rates.
• Keep different books separate with workplaces.

PLAN AHEAD
• Set budgets and create recurring or one-time planned payments.
• Use Safe to Spend to estimate your lowest projected liquid balance across the next 30 days, based on the entries and plans you provide.
• Review upcoming obligations before payday.

KEEP CONTROL OF YOUR DATA
• No bank connection or app account is required for ordinary bookkeeping.
• Export and restore JSON backups, or import supported Ivy Wallet and Cashew files.
• Protect app access with device authentication and use widgets for a quick view.
• Use voice input to draft transactions.
• Optional Gmail capture checks new Inbox messages on your device for transactions. Review matches or enable automatic capture. Gmail access can read across your mailbox; selected match details are stored locally. See the Privacy Policy for details.

Full Frills Balance is a record-keeping tool. Safe to Spend is an estimate based on information you provide, not financial, tax, or investment advice.

## Still needed before App Review

- iPhone screenshots: App Store Connect currently has 0 of 10 screenshots. It accepts 1206 × 2622, 2622 × 1206, 1179 × 2556, or 2556 × 1179 px for the medium Dynamic Island group. The landing repo's screenshot images are 1080 × 2424 or smaller, so they are not directly uploadable at the required sizes; use current iOS screenshots instead.
- Publish the saved App Privacy answers after the updated privacy policy is live.
- Content Rights declaration.
- Copyright owner. App Review contact details and the note explaining that sign-in is not required and Gmail is optional are now saved; reviewer credentials are not needed.
- Export-compliance classification. The app uses QuickCrypto for SHA-256 and RSA signature verification in Gmail DKIM checks; Apple's guidance says OS-provided HTTPS is typically exempt, but the app's custom cryptographic library use still needs a correct classification.
- Price and availability choice.
- Digital Services Act account verification in App Store Connect.
