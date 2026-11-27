# Project docs

- **Accounting** — [repository ownership](architecture/REPOSITORY_MAP.md), [Account Tree](architecture/ACCOUNT_TREE_OWNERSHIP.md), and [journal currency and balancing](adr/0007-journal-currency-and-balancing-decision-layer.md).
- **People and personal ledger** — [People account-grouping decision](adr/0008-people-group-ledger-accounts.md) and the [FUL-97 behavior ticket](https://linear.app/full-frills-balance/issue/FUL-97/people-books-person-open-items-splits-and-settle-up-in-a-workplace).
- **App behavior** — [User, Device, Workplace, and Setup](specs/user-device-workplace/spec.md), [gestures and navigation](architecture/GESTURE_INTERACTIONS.md), [typography](design/typography.md), [UI audit closure plan](design/ui-audit-closure-plan.md), [Reports capability matrix](design/reports-capability-matrix.md), and [system hour cycle](adr/0001-system-hour-cycle-is-os-clock.md).
- **Transaction capture** — [capture and review](specs/automatic-transaction-capture/spec.md), [Account matcher discovery](specs/account-matcher-discovery/spec.md), and [Planned Payment settlement](specs/evidence-driven-planned-payment-settlement/spec.md).
- **Shipping** — [mobile release](operations/mobile-release.md), [web deployment](operations/vercel-web-deployment.md), [mobile E2E](architecture/MOBILE_E2E.md), and the [App Store listing](release/app-store-listing.md) (live: [apps.apple.com](https://apps.apple.com/us/app/full-frills-balance/id6833898432)).
- **Terms** — [domain glossary](../CONTEXT.md).

## Feature ideas

| Idea | First usable slice |
| --- | --- |
| Faster entry on lower-end phones | Time a repeat expense from launch to save. Reuse the last eligible account and put amount and title first where the measurement shows friction. |
| Statement import into Bulk Entry | Revisit the gated implementation at `69dddf0f9`. Start with one supported statement format and reviewable mappings. Prove replay and duplicate handling before enabling it. |
| Encrypted offline backup | Review the work on `codex/v1-key-management-recovery`. Prove backup and recovery on a second device and the supported platforms before enabling it. |
| Optional private multi-device sync | Start with one person's Workplace on two devices. Settle conflict, offline, and recovery behavior before adding shared roles. |
| More useful Reports V2 | Compare current reports with the requests. Start with a saved view for period, filters, and account/category grouping. |
| Budget allocations | Validate parent budgets and their category allocations with more users. Prove that Safe to Spend counts each allocation once before adding rollover or paycheck templates. |
| Savings targets | Try a target amount, contributions, and progress inside Plans. Validate demand before adding scheduling or automatic transfers. |
| Cross-category tags | Prove one use case, such as a trip across food, groceries, and transport, with a date-filtered breakdown. |
| Additional bank alert sources | Pilot Android bank-app notification capture with a small allowlist and review-first drafts. Evaluate Apple Mail via Shortcuts separately. Test replay, permission revocation, and duplicate SMS/notification delivery. |
| Balance-first Account details | Prototype the balance header followed by Transactions and the period selector. Preserve reconciliation access and put supporting metrics behind a disclosure. |

## Verification still worth doing

- Exercise native pager and drawer behavior using the [device acceptance checks](architecture/GESTURE_INTERACTIONS.md#device-acceptance).
- Verify the Play in-app update path with a genuine install from the relevant Play track.
- Measure release-device startup and forecast latency before enabling the background Worklets path in production.
- Compare the recorded capture and settlement contracts with current rollout and device evidence before expanding supported alert sources.
