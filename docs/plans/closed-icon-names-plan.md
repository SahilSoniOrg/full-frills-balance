# Closed icon names

**Status:** Implemented
**Date:** 2026-09-09

Kill the lie that `IconName` is a closed catalog while the rest of the app treats it as a free string. Untrusted strings stay strings. Drawable names are branded `keyof typeof IconMap` values, minted through generated `Icon` constants. Parse once at persistence/import seams.

## Problem

`src/types/domainIcons.ts` keeps a hand-written union of catalog keys **and** `(string & {})`. Any string type-checks as `IconName`. Call sites then `as IconName` instead of parsing. `AppIcon` returns `null` for unknown names, so a compile-clean value can still draw nothing (`receiptLong` on journal details income).

Workplace already parses (`toWorkplaceIcon`). Accounts, imports, and several view models do not.

## Rule

| Layer     | Type       | Examples                                                                        |
| --------- | ---------- | ------------------------------------------------------------------------------- |
| Untrusted | `string`   | Watermelon `@field`, SQL rows, import JSON, nav params, `CanonicalAccount.icon` |
| Drawable  | `IconName` | `AppIcon`, pickers, UI commands, parsed plains                                  |

`IconName = Brand<keyof typeof IconMap, 'IconName'>`. `Icon` is generated from
`IconMap`, so callers never repeat the catalog strings. No parallel union. No
`(string & {})`.

One parser in `domainIcons.ts`:

```ts
export function parseIconName(raw: string | null | undefined, fallback: IconName): IconName {
  return isValidIconName(raw) ? raw : fallback;
}
```

`isValidIconName` then actually narrows. `toWorkplaceIcon` becomes `parseIconName(icon, DEFAULT_WORKPLACE_ICON)`.

Do **not** make `AppIcon` the only parser. That leaves `PlainAccount.icon: IconName` dishonest.

## Defaults

| Fork                                        | Decision                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Where to parse                              | Read/import mapping (`toPlainAccount`, `toPlainWorkplace`, `getAccountIcon`, canonical import builder). Not every screen. |
| Invalid stored account icon                 | Fall through to system-account name rules, then type fallback. Invalid names no longer win.                               |
| Watermelon models                           | `@field('icon')` is `string`, not `IconName`.                                                                             |
| `PlainAccount.icon` / `PlainWorkplace.icon` | `IconName` because `toPlain*` parsed.                                                                                     |
| `AppIcon`                                   | Keep a runtime `isValidIconName` last line of defense. Props stay `IconName`.                                             |
| Aliases (`add`/`plus`, `close`/`x`)         | Out of scope. Catalog smell, not the type hole.                                                                           |
| `IconPickerModal` thin wrap                 | Out of scope.                                                                                                             |

## Small commits

### 1. Close the type and add the parser

- Replace the `IconName` union with a brand over `keyof typeof IconMap`.
- Generate the `Icon` constants from `IconMap`; do not maintain a second list.
- Add `parseIconName`. Point `toWorkplaceIcon` at it.
- `ACCOUNT_ICON_PALETTE` uses `satisfies readonly IconName[]`.
- Extend `src/types/__tests__/domainIcons.test.ts`: valid names, unknown names, fallback.

This commit is allowed to fail typecheck if it is immediately followed by the seam commits. Prefer landing parser + tests first, then flipping the type in the same or next commit so `tsc` is the punch list.

### 2. Persistence and account domain

Untrusted stays `string`; parsed plains are `IconName`.

- `Account.icon` → `string | undefined`. `toPlainAccount` uses `getAccountIcon` / `parseIconName`.
- `getAccountIcon`: if stored name is valid, use it; else system-account prefixes; else `getAccountFallbackIcon`. Drop `as IconName`.
- `getAccountFallbackIcon` already returns catalog keys; keep it.
- `accountSystemAccountInputs` / `accountSystemAccounts`: type config icons as `IconName` at source (`app-config`) or `parseIconName(..., 'scale' | 'wrench')`. No casts.
- `resolveAccountIcon`: treat invalid `customIcon` as missing (`parseIconName` or `isValidIconName`), not truthy-string.
- `AccountPersistenceInput.icon` stays `string` (already). Commands that accept picker output keep `IconName`.
- Tests: `accountIcon.test.ts` — invalid stored icon uses type fallback; system accounts still match by name.

### 3. Import and restore

Canonical and plugin output is untrusted.

- `CanonicalAccount.icon` → `string | undefined`.
- ivy / cashew plugins: map foreign names through `parseIconName` / existing cashew map (map values are already catalog keys). No `as IconName`.
- `canonicalImportBuilder`, `restoreTypes`, `restoreAutoOutput`: parse at the boundary into domain `IconName`.
- `WorkplaceService` create path: `parseIconName` instead of cast.

### 4. View models and UI literals

Compiler-driven sweep. Replace every `as IconName` with parse or a real catalog literal.

Known dishonest sites:

- `useJournalDetailsViewModel`: `'receiptLong'` → a real name (`receipt` or `trendingUp`).
- `journalEntryCardViewModel`: `JournalTimelineIconKey` is already a subset of catalog names; assign without cast (or type `typeIcon` as `IconName` in the timeline type so services still avoid Lucide).
- `journalEntryCard` badge `icon?: IconName | string | null` → parse at the mapper; card props take `IconName`.
- `accountFormService` `previewIcon?: string` → `parseIconName` / `resolveAccountIcon`.
- `useAccountDetailsData`, `PlannedPaymentDetailsView`, `WorkplaceCategorySelectionStep`, `SelectionActionBar` (`'share' as IconName` is unnecessary once the type is closed).
- `IvyIcon` / `SettingsIcon`: after `isValidIconName`, the value **is** `IconName`; drop the cast.
- `defaults.ts`: drop the `as IconName` after `isValidIconName`.
- Delete setup’s duplicate `isIconName` if it is only `typeof === 'string' && isValidIconName`.

Keep `fallbackIcon` on `AppIcon` for presentation that still has an extra hint; domain parse is what makes plains safe.

### 5. Verify

- `tsc` clean.
- Grep: no `as IconName`, no `(string & {})`.
- Tests: `domainIcons`, `accountIcon`, `Workplace.test.ts` (`toWorkplaceIcon`).
- Adding an icon is: add to `IconMap`, and to `ACCOUNT_ICON_PALETTE` only if users may pick it.

## Done when

- `IconName` is branded `keyof typeof IconMap`, and `Icon` is generated from
  `IconMap`.
- Untrusted inflows go through `parseIconName` (or `getAccountIcon` / `toWorkplaceIcon`).
- Unknown DB/import values show a fallback glyph, never a hole.
- A fake literal like `'receiptLong'` is a type error.

## Out of scope

- Deduping Lucide aliases.
- Thin wrappers (`IconPickerModal`).
- Rewriting `SettingsIcon`’s boolean `iconColor`.
- Migrating stored SQLite values; parse-on-read is enough.
