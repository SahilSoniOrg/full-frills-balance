## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:

- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## UI conventions

Layout uses `Stack` / `Inline` / `Box` props (`@/src/design-system`); `StyleSheet` holds only what props can't express.

- **Props:** direction, `gap`, padding, margin, alignment and flex, with spacing keys (`gap="md"`, `padding="lg"`). `gap` is the only spacing prop.
- **StyleSheet:** absolute positioning, shadows, transforms, theme-derived colours, platform branches, and styles on hot list rows.
- **Tokens, not numbers:** `Spacing`, `Size`, `Shape.radius` (`xs` 4 … `xxxl` 32), `Layout`. User-facing copy goes in `AppConfig.strings` or `src/constants/copy`.

**Migrate what you touch.** When you edit a component for any reason, convert the code you're changing to these rules, plus the rest of that component when it's small. Don't sweep untouched files in an unrelated change.

Reuse these before building your own:

| Need                                | Use                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen shell, header, back/close    | `ScreenWithChrome` + chrome builders. Close/Back comes from route presentation; don't pass `backIcon`.                                                                                                                                                           |
| Header icon actions                 | `ScreenHeaderActions` / `DetailHeaderMenuActions`; `PrivacyToggleButton` is always last.                                                                                                                                                                         |
| Loading / empty / error / not found | `LoadingView` (`variant="inline"` inside a page), `EmptyStateView`, `ErrorStateView`                                                                                                                                                                             |
| Rows, groups, section titles        | `ListRow` (rows with chevrons), `ListGroup`, `ScreenSectionHeader`, `SectionLabel`                                                                                                                                                                               |
| Cards                               | `AppCard` (single `padding` prop, default `lg`)                                                                                                                                                                                                                  |
| Press handling                      | `PressScaleTouchable` (or an approved shared control). `AppToggle` and `ErrorBoundary` may use native `Pressable` directly; `ErrorBoundary` must stay dependency-free.                                                                                           |
| Filter chips                        | `FilterChipButton`                                                                                                                                                                                                                                               |
| Search input                        | `SearchField` (`InlineSearchField` for expanding header search)                                                                                                                                                                                                  |
| Show/hide toggles                   | `DisclosureToggle` in a section, `DetailDisclosure` for a titled block                                                                                                                                                                                           |
| Sheets and dialogs                  | `presentation: 'formSheet'` for a compose/pick destination that is its own screen; in-screen sheets (filters, date pickers, action sheets, calculators, confirmations) stay on `ModalSurface` (`position="bottomSheet"`); centered confirmations remain dialogs. |
| Inline notices                      | `NoticeBanner` (`title`, `action` optional)                                                                                                                                                                                                                      |
| Icon-only buttons                   | `IconButton` (`accessibilityLabel` is required)                                                                                                                                                                                                                  |
| Headers                             | All routes set `headerShown: false` and render custom chrome so iOS, Android, and web layouts match; no native stack headers.                                                                                                                                    |

Don't add raw `Text`, `TouchableOpacity`, `Pressable`, `TextInput`, `Modal` or `ActivityIndicator` from `react-native` where one of these fits. If a shared component is missing a variant you need, extend it rather than copying it into a feature.

## Releases

Building, publishing, signing keys, store uploads, or Google Sign-In client IDs: read [`docs/operations/mobile-release.md`](docs/operations/mobile-release.md) first.

## Source of truth

Prefer **code, tests, and types** over prose. Historical docs live in a separate archive repo and must not be treated as current.
