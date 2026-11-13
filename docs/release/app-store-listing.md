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

The account-level Digital Services Act declaration is complete. The user classified the app as a personal hobby; App Store Connect is set to non-trader and showed regulatory requirements complete.

Seven iPhone screenshots are uploaded to App Store Connect for the medium Dynamic Island display; the page shows 7 of 10 App Store screenshots.

The App Privacy questionnaire is published with six data types: Device ID, Product Interaction, Coarse Location, Crash Data, Performance Data, and Other Diagnostic Data. PostHog receives IP addresses and adds approximate GeoIP fields; IP anonymization is off. These analytics and diagnostic types are linked to the app installation's pseudonymous analytics ID, are not used for tracking, and are used for analytics or app functionality as applicable. Apple Speech Recognition may send voice audio to Apple for real-time transcription; the policy discloses this, but the app does not retain audio recordings. The landing-page policy was published to production on November 13, 2026.

The App Store version is set to `1.0.0`, matching the binary. The 4+ age rating and App Review contact are saved. Content Rights is now saved as “Yes, this app has the necessary rights to its third-party content,” after the user confirmed the permissions/rights basis. EAS build 3 (`fd25920e-17bd-4b1a-8216-3f3b6f256d95`) predates the updated in-app voice disclosure; its upload succeeded, but TestFlight still showed no builds about 30 minutes later. Corrected build 4 (`925db3a8-fa64-4fdc-9f8c-55fdf06044ff`) included the updated disclosure. Apple then emailed ITMS-90683 for build 4: missing `NSPhotoLibraryUsageDescription`, because bundled SDKs referenced photo-library APIs despite the app having no photo feature. Build 5, which added a purpose string, was canceled. The intended policy is to request no photo-library access: the unused `expo-image` dependency and plugin are removed, and a persistent Bun patch removes `expo-file-system`'s iOS PhotoKit asset handlers while retaining regular file operations. CocoaPods was reinstalled from the patched package; `expo-image` and its image-codec pods are no longer linked. EAS build 6 (`f0c29540-d4df-4115-813f-53393d7da8e3`) finished successfully and was submitted to App Store Connect as `26556e4a-d0e3-4733-a425-12b01e51ff30`. Do not submit the version for App Review until the remaining declarations are resolved.

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

- Export compliance: Build 6 remains “Missing Compliance.” The app uses SHA-256, RSA-SHA256 signature verification, and UUID generation; it does not encrypt stored finance data or backups. App Store Connect requires a French encryption declaration because standard algorithms are used and France is in the availability list ([Apple's requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)). ANSSI's declaration is filed through its online service and may require supporting product and identity/business documents ([ANSSI procedure](https://demarche.numerique.gouv.fr/commencer/declaration-relative-a-un-moyen-de-cryptologie)). A source-based technical description is drafted at [`export-compliance-technical-description.md`](./export-compliance-technical-description.md); it is not an ANSSI filing. Upload the French declaration to App Store Connect and wait for Apple's review. Apple then provides an Info.plist key for future submissions ([upload process](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation)).

App Review contact details and the note explaining that sign-in is not required and Gmail is optional are saved. Reviewer credentials are not needed.
