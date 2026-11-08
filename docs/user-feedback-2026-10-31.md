# Telegram feedback review — 31 October 2026

## Scope and limits

Read the 673 messages returned by `tg history @FullFrills --limit 100000 -o json`, spanning 16 February–31 October 2026, IDs 3–781. This covers the accessible text history returned by the CLI; deleted messages and the contents of image/video/document attachments are not covered. Message-ID gaps are not evidence of missing pagination. Raw export retained locally in `.scratch/telegram-feedback/history.json`; do not publish it. No messages sent, issues filed, or app changes made.

Status below reflects conversation evidence, including subsequent release announcements, not verification of the current app. “Open” means no explicit resolution found in this history. Earlier feedback-round artifacts were not located in docs or .scratch; this review reconciles requests against later messages rather than claiming an exact delta from an earlier audit.

## Verdict

Fixable. The app’s recurring problem is friction between its accounting model and everyday use. Users explicitly say fast entry and successful migration determine whether they switch. Feature volume is not the same as demand: Jeam supplies most of the detailed budgeting/reporting backlog; preserve those ideas, but do not mistake repeated posts from one person for broad validation.

## Outstanding or partially addressed requests

| Priority | Request and evidence | Conversation status / recommended scope |
| --- | --- | --- |
| P1 | Optional Google login and multi-device transaction sync — Jeam [630](https://t.me/FullFrills/630), [632](https://t.me/FullFrills/632), [635](https://t.me/FullFrills/635), [652](https://t.me/FullFrills/652) | Explicit repeat demand. Developer confirms unavailable at 636; later releases prepare for online accounts without announcing sync. Start with optional private-book sync; family roles and cross-workplace transfers are developer expansion, not this user's minimum request. |
| P1 | Faster, simpler entry and navigation — Zaid [197](https://t.me/FullFrills/197)–200, Corvo [202](https://t.me/FullFrills/202), PsychoSAM [455](https://t.me/FullFrills/455), Thobias [729](https://t.me/FullFrills/729)–731 | Multiple independent users. Latest releases improve suggestions, entry screens and startup, but no later user confirmation settles the low-spec responsiveness complaint. Preserve last account, make amount/title entry quick, and reduce accounting decisions. |
| P1 | More useful, configurable reports — Jeam [505](https://t.me/FullFrills/505), [517](https://t.me/FullFrills/517), [675](https://t.me/FullFrills/675)–677; Thobias [760](https://t.me/FullFrills/760) | Partial: period comparisons, budget performance, drilldowns and explanation buttons announced later. Remaining asks include saved report configurations, section visibility/order, account-versus-category breakdown, separate income/expense/savings views, heatmap, richer debt analysis and PDF/document reports. Establish what remains in the current implementation before creating tickets for the whole bundle. |
| P2 | Parent budgets with category allocations — Jeam [481](https://t.me/FullFrills/481), [487](https://t.me/FullFrills/487) | No release resolution found. Explicitly called the feature they most want. Parent total must not double-count child commitments in Safe to Spend. |
| P2 | Paycheck budgeting, rollover and templates — Jeam [480](https://t.me/FullFrills/480)–481 | No explicit shipping evidence. A two-week repeat schedule alone does not establish a paycheck allocation workflow. Keep these as separate product decisions. |
| P2 | Savings target and progress — Jeam [613](https://t.me/FullFrills/613), [616](https://t.me/FullFrills/616), [620](https://t.me/FullFrills/620) | Backlogged by developer. Target amount, contributions and progress within existing Plans; no evidence users need another top-level system. |
| P2 | Cross-category tags and tag-based reports — Zaid [197](https://t.me/FullFrills/197), [251](https://t.me/FullFrills/251) | Travel example: groceries, food and transport grouped by tag plus date range. Do not confuse these with Jeam's “suggestion tags,” which mean account autofill. No explicit release resolution found. |
| P2 | Encrypted backup/export with a password — Corvo [391](https://t.me/FullFrills/391) | Developer acknowledged at 392; no encryption release confirmation found. ZIP compression is not encryption. |
| P2 | Dashboard choice beyond Safe to Spend — Jeam [480](https://t.me/FullFrills/480), [487](https://t.me/FullFrills/487) | Chart hide toggle and clearer shortfall wording shipped. Alternate main summaries, configurable dashboard charts and expense allocation view remain only partly addressed; money-flow reports are not necessarily the requested dashboard. |
| P2 | Budget threshold/pace alerts, subscription end reminders, linked insights — Jeam [480](https://t.me/FullFrills/480), [572](https://t.me/FullFrills/572), [682](https://t.me/FullFrills/682)–683 | Existing insights and planned-payment schedule are partial substitutes. Explicit configurable threshold alerts, subscription lifecycle management and contextual insight-to-report navigation not confirmed shipped. |
| P2 | Broader widgets — Jeam [573](https://t.me/FullFrills/573), [578](https://t.me/FullFrills/578) | Wants net worth, net inflow, income and expenses. Safe-to-Spend/action widgets exist and were polished later; those do not satisfy all requested metrics. |
| P2 | Published iOS app — Zaid [291](https://t.me/FullFrills/291), Thobias [776](https://t.me/FullFrills/776) | Explicitly still unpublished on October 29 at 777. Source build instructions are not distribution. |
| P3 | Community translation workflow — Corvo [49](https://t.me/FullFrills/49) | Developer agrees; no shipping confirmation found. |
| P3 | Adjustable font sizing and smaller install — Zaid [118](https://t.me/FullFrills/118), [188](https://t.me/FullFrills/188) | Font themes, compact account picker and performance work do not establish adjustable global text sizing or reduced package size. |
| P3 | Transaction card layout choices — Thobias [756](https://t.me/FullFrills/756) | Exploratory, not a demonstrated blocker. Developer asked for examples; user accepted redesign. Avoid maintaining four or five layouts without stronger evidence. |
| P3 | Hide opening-balance equity clutter — Jeam [517](https://t.me/FullFrills/517) | Developer considered hiding equity movements at 519. Preserve balancing entries; visibility is the useful request. No explicit resolution found. |

## Addressed in later announcements — do not blindly reopen

- **Cashew migration:** Sky repeatedly blocked from switching at 156–175, 742 and [659](https://t.me/FullFrills/659). Explicit fix announced today at [779](https://t.me/FullFrills/779), direct follow-up at 780. **Await user confirmation**; this is the clearest historical conversion blocker.
- **Local SMS formats:** Thobias asks for templates/help and USD20.60/Ksh49.05 parsing at [741](https://t.me/FullFrills/741), 747. Local-format and adjacent-currency parsing announced at 779. Parsing is addressed in announcement; user-facing template/help request is not explicitly resolved.
- **CSV import:** Penjore at 482; announced at 648. Filtered transaction CSV exports added at 771–772. Neither proves PDF financial reports shipped.
- **Daily budgets, shortfall language and chart hide toggle:** Jeam 480; announced at 493–494, with further forecast explanations in 762/766.
- **Cash adjustment classification:** Jeam 480/487; selectable counterparty/adjustment announced at 493. This addresses much of the workflow; do not implement their proposed accounting semantics literally if it would distort financial reporting.
- **Archive liabilities/accounts:** Jeam 517; announced at 525.
- **Account colors/icons:** Jeam 479/520/529; announced at 552 and expanded at 670. Pinned accounts were suggested at 521; reordering already existed, so validate whether pinning adds value.
- **Batch notes and 12-hour clock:** Jeam 624/663/664, earlier Sky 40; explicitly shipped at 670–673.
- **Calculator and better suggestions:** Jeam 637–645; announced at 648–650. Two-sided transfer suggestions and batch income/expense/transfer suggestions explicitly added at 751, answering 685–697.
- **Ivy title/description preservation and notes search:** Corvo 366/391; announced at 379/399.
- **Swipe navigation:** Zaid 184; explicitly announced at 779 and acknowledged at 781. Original request included a toggle; announcement does not confirm that preference exists.
- **Credit card dates and loans:** Treshene 417/561 and PsychoSAM 455. Developer points to liability subtypes and statement/payment dates at 419/456/562; EMI/minimum-payment support announced at 318. Repeated questions show discoverability problems, not proof those capabilities are absent.
- **Font consistency:** Corvo 213/225/322 and Sanket 738; multiple later consistency fixes, including 767. No final user confirmation.

## Historical bugs that merit confirmation, not assumed fresh implementation

- Planned-payment manual posting at midnight rather than actual posting time: Zaid 121, 183, 198. Developer says fixed at 227; no explicit subsequent confirmation of timestamp semantics.
- Black screen after posting a planned payment: Corvo 231/270; Corvo reports it no longer occurs at 320.
- Pausing manual schedules should hide upcoming entries: Corvo 230/246/247; developer acknowledged. No exact resolution found.
- Deleted planned payments leave stale scheduled entries: Jeam 564/582; developer says new deletions are fixed, historical orphans remain at 584. Later scheduling work does not explicitly certify cleanup of old orphans.
- Editing next occurrence after accidental posting/deletion: Jeam 498/502. Developer points to day-of-month editing; recovery semantics remain unconfirmed.
- Monthly spent/refund/income totals: Jeam 467/583. Corrected account totals announced at 648 and later account/category detail redesigns.
- Safe-to-Spend double subtraction after editing: Zaid 124/127/128. Later refresh/calculation improvements exist, but no precise user confirmation found.
- Currency change requires restart: Ahmed 406–414; developer acknowledges at 415. Later settings refresh fixes do not explicitly confirm this exact case.

## Recommended next round

1. Close the loop on today's Cashew and SMS parsing fixes with the original reporters before expanding migration work. User outreach needs separate authorization; none was sent.
2. Make fast entry and low-spec interaction latency the next usability target. Demand comes from multiple users and directly affects adoption.
3. Inventory report features against the remaining asks; prioritize saved configuration and understandable debt/cash-flow summaries over adding every chart.
4. Treat optional sync as a bounded project with conflict handling and offline behavior. Stop expanding its scope into collaboration before basic multi-device reliability exists.
5. Validate parent/paycheck budgets and savings goals with more than one user before committing a large planning-model rewrite.

No tests run: this is a read-only feedback analysis, not an implementation change.
