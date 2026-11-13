# App Store listing draft

For **Full Frills Balance**, bundle ID `in.sahilsoni.fullfrillsbalance`, version `1.0.0`.

## App Store Connect progress

Apple's App Store Connect Terms of Service were accepted after explicit approval. The app record is **6833898432**.

Saved in App Store Connect:

- Promotional text, description, keywords, support URL, and marketing URL.
- Subtitle and Finance primary category.
- Privacy policy URL, now live at `https://fullfrills.sahilsoni.in/privacy.html`.
- Copyright: `© 2026 Sahil Soni`.
- Price: Free in all 175 available territories.

The App Privacy questionnaire is published with six data types: Device ID, Product Interaction, Coarse Location, Crash Data, Performance Data, and Other Diagnostic Data. PostHog receives IP addresses and adds approximate GeoIP fields; IP anonymization is off. These analytics and diagnostic types are linked to the app installation's pseudonymous analytics ID, are not used for tracking, and are used for analytics or app functionality as applicable. Apple Speech Recognition may send voice audio to Apple for real-time transcription; the policy discloses this, but the app does not retain audio recordings. The landing-page policy was published to production on November 13, 2026.

The App Store version is set to `1.0.0`, matching the binary. The 4+ age rating and App Review contact are saved. Content Rights is set to “No, this app does not contain, show, or access third-party content,” per the user's declaration. EAS build 3 (`fd25920e-17bd-4b1a-8216-3f3b6f256d95`) predates the updated in-app voice disclosure; its upload succeeded, but TestFlight still showed no builds about 30 minutes later. Corrected build 4 (`925db3a8-fa64-4fdc-9f8c-55fdf06044ff`) included the updated disclosure. Apple then emailed ITMS-90683 for build 4: missing `NSPhotoLibraryUsageDescription`, because bundled SDKs referenced photo-library APIs despite the app having no photo feature. Build 5, which added a purpose string, was canceled. The intended policy is to request no photo-library access: the unused `expo-image` dependency and plugin are removed, and a persistent Bun patch removes `expo-file-system`'s iOS PhotoKit asset handlers while retaining regular file operations. CocoaPods was reinstalled from the patched package; `expo-image` and its image-codec pods are no longer linked. EAS build 6 (`f0c29540-d4df-4115-813f-53393d7da8e3`) finished successfully and was submitted to App Store Connect as `26556e4a-d0e3-4733-a425-12b01e51ff30`. Do not submit the version for App Review until the remaining declarations and assets are ready.

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

- iPhone screenshots: App Store Connect currently has 0 of 10 screenshots. It accepts 1206 × 2622, 2622 × 1206, 1179 × 2556, or 2556 × 1179 px for the medium Dynamic Island group. The landing repo's 1080 × 2424 screenshots are Android captures, so use current iOS screenshots instead.
- Review the Content Rights “No” declaration against Apple's wording before App Review, since the app can optionally read Gmail messages and retrieve exchange-rate data.
- App Review contact details and the note explaining that sign-in is not required and Gmail is optional are saved; reviewer credentials are not needed.
- Export compliance: the app uses QuickCrypto for SHA-256 and RSA-SHA256 DKIM signature checks. Apple marked Build 6 as Missing Compliance and says documentation must be uploaded and approved for France distribution before providing the resulting key in Xcode.
- Digital Services Act account verification in App Store Connect.
