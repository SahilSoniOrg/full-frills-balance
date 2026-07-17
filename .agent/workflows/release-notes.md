---
description: Propose and write user-centric release notes for app releases
---

# Release Notes Creation

Follow these steps to analyze git history and generate user-centric release notes in the correct format.

## 1. Retrieve the History
- Find the previous release notes file in [release-notes/android/](./release-notes/android) to identify the last version tag (e.g., `abv_00121`).
- Run `git log <last-tag>..<target-tag> --oneline` (or check full logs if needed) to gather all commit messages between the releases.

## 2. Filter & Translate (User-Centric vs. Dev-Centric)
- **Remove Noise**: Omit minor visual cleanups, dev tooling/script changes, and internal refactors that do not visibly change app functionality.
- **No Developer Jargon**: Never use tech terms like `caching`, `state/view models`, `refactoring`, `layout constraints`, `skeleton loaders`, or CSS/styling class names.
- **Translate to Value**: Frame every change in terms of user benefits.
  - *Dev-centric*: "Resolved caching issue in transformAccounts."
  - *User-centric*: "Instant updates for reconciliation timestamps."

## 3. Structure & Format
Generate a text file at `release-notes/android/abv_<version>_<DD_MM_YYYY>.txt` using the template below:

```text
New release 🚀

[Brief 1-2 sentence headline highlighting the theme or main features of this release]

---

Also in this update:

* [Feature Name]: [User-friendly description focusing on utility/benefit]
* [Feature Name]: [User-friendly description focusing on utility/benefit]

---

Big difference you’ll notice:

* [Bullet describing how the app feels different or easier to use]
* [Bullet describing how the app feels different or easier to use]

---

Under the hood, we [brief description of developer-facing upgrades, tests, or internal routing changes].
```