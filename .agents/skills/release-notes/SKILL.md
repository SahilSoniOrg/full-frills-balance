---
name: release-notes
description: >-
  Write user-centric store release notes for Android (abv_) or iOS (ibv_).
  Use when drafting Play Store / App Store "What's New", creating
  release-notes/*.txt, or tagging abv_/ibv_ builds.
---

# Release Notes Creation

Follow these steps to analyze git history and generate user-centric release notes.

House style comes from accepted notes and edits in recent release threads (especially `abv_00189` and `abv_00208`): short, everyday language; lead with what people use every day; no store-brochure voice.

## Platforms

| Platform | Prefix | Notes directory | Git tag | Store URL |
| --- | --- | --- | --- | --- |
| Android | `abv_` | [release-notes/android/](../../../release-notes/android) | `abv_NNNNN` | `https://play.google.com/store/apps/details?id=in.sahilsoni.fullfrillsbalance` |
| iOS | `ibv_` | [release-notes/ios/](../../../release-notes/ios) | `ibv_NNNNN` | `https://apps.apple.com/us/app/full-frills-balance/id6833898432` |

Build numbers are zero-padded to **5 digits** (`abv_00208`, `ibv_00011`). Ask which platform and target build if the user does not say. Do not invent a build number.

Before drafting, open the **2–3 most recent** notes in that platform directory and match their length and rhythm. Prefer the newest accepted file when punctuation differs (recent notes use `Label — detail`).

## 1. Retrieve the History

- List the notes directory for that platform and take the highest prior `*_NNNNN_*` file as the previous release.
- Prefer `git log <previous-tag>..<target-tag> --oneline` when both tags exist. If the target tag is missing, use commits since the previous tag (or ask for the range).
- **Read the diff**, not only commit subjects. Specs and product copy in the range often beat the log for what users will feel.
- Confirm marketing version separately when needed (`1.0.0` is not the `abv_`/`ibv_` build id).

## 2. Rank What Matters (before writing)

Order by how often a normal user hits it, not by commit count or engineering pride:

1. **Headline theme** — the one daily-path change (capture, card signs, Safe to Spend, etc.).
2. **Also in this update** — a few supporting items people will notice.
3. **Buried or skip** — one-time setup, rename-only chrome, incomplete/gated work (say so plainly or omit), and anything only a developer would care about.

If the theme ranking is unclear, ask the user which change should lead. Do not bury the daily change under onboarding or internals.

## 3. Filter & Translate

- **User-visible only**: Cut upload resume, CI, refactors, “rebuild layers,” telemetry, and other shipping plumbing. If the only leftover for “Under the hood” is internals, omit that section.
- **Words users recognize**: Prefer “red minus / green plus,” “main button,” “over the screen you're on” over “footers,” “balance rebuild,” “accuracy layer.”
- **No developer jargon**: Never use terms like `caching`, `state/view models`, `refactoring`, `layout constraints`, `skeleton loaders`, or CSS class names.
- **Honest about status**: Incomplete or parked features get a plain line (“Removed for now,” “built, still pending approval”) or stay out.
- **Lean for the release size**: Cleanup/privacy/bugfix notes stay short. One theme in the headline, often 2–4 “Also” bullets. Don't inflate every commit.
- **Sound human, not AI**: Plain sentences. No parallel marketing cadence, invented title-case feature names, filler, or restating the same point in “Big difference.” Contractions are fine. Read it out loud.

## 4. Structure & Format

Write:

`release-notes/<android|ios>/<abv|ibv>_<NNNNN>_<DD_MM_YYYY>.txt`

Use today's date unless the user gives another. For a **store-published** build, include the platform download line under the headline. Skip the download line for TestFlight / internal-only notes unless asked.

```text
New release 🚀

[1–2 plain sentences: the daily-path theme. Name what changed; don't sell it.]

Download: [platform store URL from the table above]

---

Also in this update

* [Short label] — [What changed, in everyday words]
* [Short label] — [What changed, in everyday words]

---

Big difference you'll notice

* [One concrete thing someone would feel — omit this whole section if the list above already covers it]
```

Optional trailing line **only** when something user-visible still needs one sentence of mechanism:

```text
Under the hood, [one short user-relevant sentence; otherwise delete this section].
```

Draft in chat for review unless the user already said to create the file. When they name the build (“as 189”), use that number.

## 5. After writing

- Show the path and a short preview; do not create the git tag unless asked.
- When tagging later, use the bare build id (`abv_00209`, `ibv_00012`) with no date suffix.
- Keep Android and iOS notes in their own directories even when the same change ships on both; write each file for that store's audience and build number.
