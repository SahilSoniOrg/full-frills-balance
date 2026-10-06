# Typography

The app uses a balanced hierarchy: expressive display titles, consistent sans-serif UI, and aligned financial numerals. Font themes change the faces, not the jobs they perform. Color themes and font themes remain independent preferences.

## Font themes

| Setting          | Internal ID  | Display                  | UI              | Financial figures |
| ---------------- | ------------ | ------------------------ | --------------- | ----------------- |
| Serif & Sans     | `deep-space` | DM Serif Display Regular | Instrument Sans | Instrument Sans   |
| Modern Geometric | `ivy`        | Raleway Bold             | Raleway         | Inter             |
| Classic Serif    | `editorial`  | Crimson Text Regular     | Inter           | Inter             |

UI and numeric families load Regular, Medium, Semibold, and Bold. Serifs carry screen titles, sheet titles, and standalone display copy. Sections, card headings, dates, labels, body text, controls, and ordinary inputs use the UI family. Money uses the numeric family at every size, including dashboard totals, account balances, budgets, reports, and calculators.

Raleway's bundled files have proportional digits and no `tnum` substitution. Inter supplies tabular figures for Modern Geometric; adding a `tabular-nums` flag to Raleway alone cannot align the digits. Instrument Sans and Inter both include `tnum`. Raleway retains the theme's geometric voice in the surrounding interface.

## Roles

`Typography.roles` in `src/constants/design-tokens.ts` owns the shared size, leading, and tracking. Sizes below are React Native logical units; native text scaling remains enabled.

| Variant      | Size / line height | Default family | Default weight     |
| ------------ | ------------------ | -------------- | ------------------ |
| `caption`    | 12 / 16            | UI             | Regular            |
| `bodySmall`  | 14 / 20            | UI             | Regular            |
| `body`       | 16 / 24            | UI             | Regular            |
| `bodyLarge`  | 18 / 26            | UI             | Regular            |
| `subheading` | 18 / 24            | UI             | Semibold           |
| `heading`    | 20 / 26            | UI             | Semibold           |
| `xl`         | 24 / 32            | Display        | Theme display face |
| `title`      | 32 / 40            | Display        | Theme display face |
| `hero`       | 72 / 86            | Display        | Theme display face |

Root navigation titles use `xl`; pushed navigation and sheet titles use `heading` with `fontRole="display"`. Small UI headings stay sans-serif. Large financial text uses the size variant with `fontRole="numeric"`.

## Usage

- Prefer `AppText` variants and `weight` over per-screen family or synthetic `fontWeight` overrides.
- `fontRole` chooses `ui`, `display`, or `numeric` independently of size. Serif display themes have one real display weight; requesting bold does not synthesize another face. Raleway can use its loaded weight files.
- `MoneyText` defaults to numeric semibold and tabular, lining numerals. Its privacy, loading, sign, and formatting behavior is unchanged.
- Prose uses proportional numerals. Opt into `tabular` for money, dates in data tables, and numeric comparisons. This also selects the numeric family unless a family role is explicitly given.
- Native inputs resolve the UI or numeric family through `useTheme`; number keyboards and hero inputs use numeric fonts. SVG chart labels use the numeric family. SVG labels use real weight files rather than synthetic bold.
- Weights stay stable in light and dark mode. Do not silently turn regular into medium or medium into semibold.
- Preserve native text scaling. Use wrapping and flexible heights for reading text; single-line financial displays can shrink within their existing containers.
- `Typography.fonts` is the legacy default pairing. It is reserved for the crash boundary, which must render without theme providers. Ordinary screens must use the active theme.

## Loading and preview

Startup loads the persisted font set. Preference switches load the requested files before committing, and the last selection wins. Settings previews warm all sets and show both the display face and a numeric sample. Unused Crimson Text Bold is no longer loaded.

The development route `/_design-preview` previews all three font themes and light/dark mode without saving preferences. Its typography section includes display copy, section headings, body and metadata, a large amount, aligned numerical comparisons, and the existing input/control gallery.

Regression coverage in `AppText.test.tsx` checks all three pairings, input families, real heading weights, numeric features, stable light/dark weights, and live theme changes. Visual verification should also cover long currency strings and enlarged native text on each shipping platform.

## Verification limits

The iPhone simulator pass covered all three font themes, light and dark appearance, dashboard/account/planned-payment hierarchy, and enlarged system text after a reload. Changing system text size while the current iOS development build stayed open showed stale text measurements until reload; live Dynamic Type reflow remains a separate issue. No Android emulator or device was connected for this pass.
