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
- **Match the Release Size**: A cleanup/privacy/bugfix release should read lean. Don't inflate every commit into a feature bullet. Pick 1 theme for the headline, a short "Also in this update" list (often 2–4 items), and only the differences users will actually feel. Big features earn space; streamlining and fixes get one line each, not their own marketing section.
- **Sound Human, Not AI**: Write like a person shipping a changelog, not a product brochure.
  - Prefer plain sentences over parallel marketing cadence ("Stronger X, clearer Y, plus Z").
  - Avoid title-case feature names that feel invented for the notes (`Privacy That Stays Sealed`). Use short, ordinary labels (`Privacy eye per screen`).
  - Cut filler and restatement. Don't rephrase the same bullet in "Big difference you'll notice."
  - Skip stock phrases: "real upgrade", "alongside the way", "more solid", "shoulder-surfing", "you'll love", em-dash triads.
  - Contractions and direct verbs are fine. Uneven bullet lengths are fine.
  - When in doubt, read it out loud — if it sounds like marketing copy, rewrite shorter and plainer.

## 3. Structure & Format
Generate a text file at `release-notes/android/abv_<version>_<DD_MM_YYYY>.txt` using the template below:

```text
New release 🚀

[1–2 plain sentences: what's actually new this release. Name the theme; don't sell it.]

---

Also in this update:

* [Short label]: [What changed, in everyday words]
* [Short label]: [What changed, in everyday words]

---

Big difference you’ll notice:

* [Only what someone would feel using the app — skip if nothing new beyond the list above]

---

Under the hood, [one short sentence on internals/streamlining if relevant; skip fluff].
```
