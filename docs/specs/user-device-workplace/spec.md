# Spec — User, Device, and Workplace tenancy

**Product:** Full Frills Balance
**Date:** 2026-08-30
**Status:** Tenancy slices 1–3 and launch/transition remediation implemented; Slice 4 (Device inbox tenancy) deferred
**Related:** glossary in [`CONTEXT.md`](../../../CONTEXT.md), and durable launch/import/transition decisions in [`docs/adr`](../../adr/)

This is the canonical tenancy contract. The implementation is delivered in slices; the current release boundary and deferred Device inbox work are stated in the acceptance and non-goals sections below.

This spec is behavior and ownership. File paths will rot; do not treat them as the contract. Terms follow `CONTEXT.md`.

## 1. Current vs target

| Area                  | Current                                                                                                                        | Target                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| First-run             | One wizard: name + currency + accounts + categories + theme; then name + Device claimed + Workplace writes                     | Device onboarding (name) then Workplace creation, followed by User theme selection before entering the app |
| Workplace at launch   | Launch coordinator resolves Device state and discovered Workplaces; historical v23 Personal migration remains upgrade backfill | No Workplace until creation or Import **finishes** on fresh installs         |
| `onboardingCompleted` | Set after books exist                                                                                                          | Set when Device is claimed (name)                                            |
| SMS enable            | Combined blob / briefly Workplace                                                                                              | Device SMS listen, default off (Slice 1)                                     |
| Inbox rows            | `workplace_id` required; pending cloned per Workplace                                                                          | Device feed; Workplace copies only on consume                                |
| Export                | User prefs + Workplace prefs; Device keys omitted; inbox is Workplace-scoped rows                                              | Unchanged Device omission; Device feed never in Workplace backup; copies yes |

## 2. Ownership

| Concern                                                                                                                                         | Owner     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Display name, theme, privacy mask, notifications                                                                                                | User      |
| App lock, Active workplace, Device claimed, telemetry id, Device inbox, Device SMS listen                                                       | Device    |
| Journals, accounts, currency, STS horizon, dismissed insights, last-used accounts, SMS rules, Workplace inbox copies, Cross-workplace auto-post | Workplace |

Ledger **Account** is a Workplace bucket. Native export is a Workplace document plus User chrome that travels with the person. Device bag and Device inbox do not travel.

## 3. Launch resolver

Run **Device recovery** first if the Device bag is absent.

Workplace discovery has explicit loading and failure states. A query failure is never interpreted as zero Workplaces: show retry/error recovery rather than offering creation and risking duplicate books.

After successful discovery, the pure resolver returns a discriminated result. `open` includes the exact `workplaceId` and whether the launch coordinator must persist it as Active workplace; callers never rediscover the selected Workplace.

```
if Device onboarding is not complete
  → Device onboarding
else if no Workplaces exist
  → Workplace creation (Default setup)  // or User chooses Import
else if Active workplace is missing or not in the list
  if exactly one Workplace
    → open(that id, persistAsActive: true)
  else
    → Workplace picker
else
  → open(that Active workplace, persistAsActive: false)
```

The resolver performs no writes and never inserts a Workplace. The launch coordinator applies explicit effects from the result before mounting books providers.

### 3.1 Device onboarding

- Required display name (non-empty after trim). Persist on User. Set Device claimed.
- Import-from-splash: if backup has a name, use it; else preserve the name entered during Device onboarding; if neither exists, use Default display name `User`; then restore is Workplace creation by restore (section 5).
- No Workplace write. No Device SMS listen on.
- Draft name may live in ephemeral/Device storage; that is not a Workplace.

### 3.2 Device recovery

Capture whether the Device bag exists before legacy preference migration can synthesize defaults. The legacy User mirror must not silently fabricate Device state.

Device bag missing:

1. Write Device defaults: claimed false, lock off, listen off, Active workplace unset, new or absent telemetry id per existing analytics rules.
2. If `count(Workplaces) > 0`: set Device claimed true (do not re-ask name). Resolve Active workplace as in the table above. Workplace existence is the upgrade/recovery proof that old setup completed; do not inspect whether the Workplace appears empty.
3. If `count(Workplaces) == 0`: leave unclaimed; Device onboarding.

Do not create a Workplace here. Device claimed is the canonical registration state. If User name is missing while claimed is true or Workplaces exist, set Default display name `User` so claimed is honest; a name alone does not claim a Device outside successful Device onboarding.

### 3.3 Workplace-optional shell

Books surfaces (Hub, journal, accounts, Workplace-scoped SMS rules, Workplace inbox copies) require a valid Active workplace. Without it, expose only the focused launch gate: Device onboarding, Workplace creation, picker, Import, and editing the display name where relevant. Do not mount a general Device shell or Settings.

`WorkplaceContext` must not call ensure-default. The launch coordinator mounts it only for `open(workplaceId)`.

Books deep links received before `open(workplaceId)` are rejected unless they carry a valid Workplace identity. Bare entity ids are not replayed after onboarding, creation, Import, or picker because the intended Workplace is ambiguous; finish the launch gate and land on Hub.

## 4. Workplace creation

One flow. Config:

|                                        | Default setup                                                                                             | Full setup                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| When                                   | Zero Workplaces (first books)                                                                             | User creates another Workplace |
| Name / icon                            | Exact name: `{trimmed name}'s Personal workplace`; fallback `User's Personal workplace`; icon `briefcase` | Asked                          |
| Currency, starter accounts, categories | Asked                                                                                                     | Asked                          |
| Persist                                | On finish only                                                                                            | On finish only                 |

Creation and Import use an operation identity for the active attempt, but wizard fields are ephemeral. A process restart returns to the launch gate instead of replaying a stale form. Backing out mid-flow creates zero new rows; factory reset also removes any legacy draft keys left by older releases.

Finish: one database transaction inserts the Workplace, system accounts, and selected starters. Database publication is the commit point; setting Active workplace and other preference pointers follows and is recoverable on the next launch if it fails.

Import: stage and validate privately, then publish the restored Workplace, set Active workplace, and set Device claimed true on successful finish. Database publication is the commit point; preference pointers are repaired on the next launch if their writes fail. **No** empty Default workplace exists beforehand, and failure leaves zero new Workplace, account, or journal rows.

First-run restore may adopt exported User preferences. If the backup has no display name, preserve the name entered during Device onboarding; use Default display name `User` only when neither exists. Settings Import preserves the current User bag and restores only Workplace data and Workplace preferences.

Only an observed database row whose ID matches the coordinator's resolved Active workplace may authorize books providers. Cached Workplace data may render non-authoritative chrome but cannot mount books surfaces.

### 4.1 Transitions

Deleting an Active Workplace first unmounts books providers, deletes its scoped rows and Workplace shell atomically, then reruns the resolver. Zero remaining Workplaces goes to Default setup/Import, one is opened and persisted Active, and several go to the picker. Deleting the last Workplace is allowed after explicit confirmation.

Switching Workplaces validates the target row, blocks books during the transition, durably persists Active workplace, evicts the old scope, mounts the target, and resets navigation to the target Hub. A failure to persist leaves the old Workplace active.

The picker presents existing Workplaces as the primary action, with Create Workplace and Import Workplace as secondary actions. It cannot cancel to Hub without a valid Active workplace.

## 5. Inbox

### 5.1 Device inbox

- One feed per install of incoming SMS (identity = existing fingerprint / device source id).
- Same list for every Active workplace.
- Not in native Workplace export.
- Survives Workplace delete.

### 5.2 Consume

Consume in Workplace W = post (manual or auto-post) or dismiss in W.

Effect:

- Upsert a **Workplace inbox** copy for W (linked journal if posted).
- Device feed row remains visible.
- If any other Workplace has a copy, Device UI shows Elsewhere-consumed with that Workplace’s name (if several, show all or the set — product: at least one name; spec: all Workplaces that consumed).

Manual consume in W is always allowed even if U already consumed.

Dismiss in W is consume-without-journal for W. It does not remove the Device feed row. Other Workplaces still see it, tagged.

### 5.3 Cross-workplace auto-post

Workplace boolean, default **off**.

When running auto-post for Active workplace W:

- If the Device message has no copy in any Workplace, or only W’s copy is pending (N/A — pending is Device-only): apply W’s rules as today.
- If any Workplace other than W has a consumed copy: apply W’s rules only if W’s Cross-workplace auto-post is on; otherwise skip auto-post (still show in Device inbox; User may post by hand).

### 5.4 Device SMS listen

Device boolean, default **off**. Off → no OS scan for anyone. On → scan; auto-post uses Active workplace + section 5.3. OS permission is separate and Device/OS.

Do not turn listen on during Device onboarding. Settings after the User has books is the path.

### 5.5 Delete Workplace W

Delete W’s copies. Device feed unchanged. Tags recompute from remaining copies.

### 5.6 Export / import

Workplace backup includes Workplace inbox copies (and journals, rules). Excludes Device inbox, Device bag (lock, listen, Active workplace, claimed flag, telemetry).

Restore writes copies into the restored Workplace. Pending Device messages on the destination phone stay whatever that Device already had.

## 6. Migration (existing installs)

- Any Workplace present when an existing install upgrades is treated as completed setup. Preserve it, mark the recovered Device claimed, and resolve it normally; do not classify it by name, row contents, or whether it began as boot-created Personal. This intentionally favors continuity over detecting abandoned empty installs.
- After ship, fresh installs must not create a Workplace until Default setup or Import finishes.
- Inbox: existing Workplace-scoped pending rows become Device feed identities (dedupe by fingerprint across Workplaces); consumed rows become copies. Exact SQL is an implementation task; invariant is one Device identity per SMS, copies only where consumed.
- `isSmsImportEnabled` on Workplace: migrate OR to Device listen (if any Workplace had it on, Device listen on) or keep off unless User had it on for the Active workplace — **decision: if any Workplace had listen on, Device listen on** so we do not silently stop scanning for people who already opted in.

## 7. Acceptance (engineering)

1. Fresh DB after Device onboarding, before Workplace finish: `workplaces` count = 0.
2. Kill app in that state: next launch is Workplace creation, not name, count still 0.
3. Finish Default setup: count = 1, Active workplace set, Device claimed true.
4. Resolver: 0 / 1 / N Workplaces as section 3.
5. Device bag deleted, 1 Workplace in DB: no name screen; that Workplace opens.
6. Native export JSON has no Device inbox array of pending OS messages; has Workplace copies if any.
7. Post in A, switch to B: message visible, tagged A, hand post in B allowed; auto-post in B skipped if flag off.
8. Delete A: B’s copy remains if B consumed; Device row remains.
9. Active books unmount before Active Workplace deletion begins.
10. Pointer cleanup failure after database success never produces “books were not changed.”
11. Pointer repair failure does not strand a valid Workplace on a loading screen.
12. Settings does not choose the post-delete Workplace or route.
13. Repeated deletion of an already-deleted Workplace is a successful no-op.

## 8. Non-goals

Cloud login, Device theme override, Device-wide “drop this SMS for every Workplace,” listen as a first-run step.
