# Full Frills Balance

Personal double-entry finance app. Ledger-first; balances derive from the journal.

## Language

### Tenancy

**User**:
The person. Owns identity and chrome that follow them across Devices and Workplaces: display name, appearance, privacy mask, notifications, and other settings that never change what the books mean or write. There is no cloud login yet; User is local. A Device is registered to exactly one User.
_Avoid_: Account (that is a ledger bucket); profile (as a synonym); owner

**Workplace**:
The tenancy for the books. Journals, ledger accounts, budgets, planned payments, and settings that change meaning or writes (default currency, Safe to Spend horizon, last-used ledger accounts, dismissed insights) belong here. SMS auto-post rules and this Workplace’s consumed-SMS copies belong here; the shared SMS feed does not.
_Avoid_: User data; workspace; company; books (as the tenancy name)

**Workplace membership**:
The relationship granting one User access to one Workplace. A User may hold memberships in multiple Workplaces; access is determined by the membership’s role and status, not by the Device that is currently open. Membership is distinct from User preferences and Device registration.
_Avoid_: Workplace ownership as a User property; active workplace; device access

**Owner role**:
The highest-trust role on a Workplace. The owner can transfer ownership and perform irreversible Workplace administration. A User is initially assigned this role when creating a Workplace; ownership is a membership role, not a property of the User or Device.
_Avoid_: User owns every Workplace; admin (as a synonym); device owner

**Identity provider**:
The service that authenticates Users and, in a future multi-device or collaborative product, may synchronize Workplace memberships and roles. The domain model remains provider-neutral; WorkOS is a possible future provider, not the domain term.
_Avoid_: WorkOS User as the canonical domain User; authentication provider as the membership itself

**Device**:
The phone (this install). Registered to one User. Owns state that must not follow the person or the books: app lock, which workplace is open, whether this Device is registered, anonymized telemetry id, Device inbox, and Device SMS listen.
_Avoid_: User; session; phone (as the domain name)

**Current tenancy boundary**:
The current product has exactly three domain entities: User, Device, and Workplace. User and Device are local identity and installation concepts; Workplace is the financial-data tenancy. Workplace membership and role-based access are future concepts for online accounts, synchronization, or collaboration and are not part of the current model.
_Avoid_: introducing membership or RBAC state before online identity exists

**Device onboarding**:
The first-run product experience that includes Device setup as one part of a broader Setup journey. It is product language, not a state-owning domain object or a synonym for every setup activity.
_Avoid_: onboarding state; onboarding completion as a catch-all; workplace setup; User onboarding

**Setup journey**:
An ordered recipe of Setup slices selected for one purpose, such as first run, restore, or later Workplace creation. A blocking journey must resume before app entry; an optional journey leaves existing books available and resumes only when requested.
_Avoid_: onboarding blob; wizard mode; hard-coded screen sequence

**Active Setup journey**:
The single unfinished Setup journey on this Device. Its Setup draft, not a separate completion flag or route marker, is the authority; only a blocking journey takes precedence over normal launch resolution.
_Avoid_: onboarding stage; onboarding completed flag; route state as progress

**Setup slice**:
One independently completable setup requirement with explicit inputs, completion criteria, and accepted output. A recipe may require it, include it only when authoritative facts are missing, or always present it for confirmation; a future Demo journal may be another slice.
_Avoid_: screen; step number; conditional branch

**Device setup**:
Registering this Device to a User. Completes when a non-empty display name exists and this install is registered; it does not create books or choose appearance. During first-run restore, an imported name takes precedence over an entered name; an entered name is used only when the backup has none, and Device setup remains required when neither exists.
_Avoid_: Device onboarding; Workplace setup; Appearance setup; silently defaulting a missing first-run name

**Default display name**:
`User` — the repair name used when existing Workplace data proves a previously completed install but its User name is missing. It never satisfies missing identity during a new Setup journey.
_Avoid_: first-run fallback; skip; anonymous; guest

**Default workplace**:
The first Workplace established on this Device by Default setup or Import restore. Under Default setup its initial identity is `{trimmed User display name}'s Personal workplace` with the `briefcase` icon; the derived name follows display-name edits until the User edits the Workplace name directly. An imported Workplace keeps its imported identity.
_Avoid_: ghost workplace; Personal (as the domain term); ensure-default-on-launch; create-on-Device-onboarding

**Workplace creation**:
The single ritual that produces a Workplace only when it **finishes**. Configured as **Default setup** or **Full setup**; Import is restore, not this ritual.
_Avoid_: Separate first-run onboarding vs Create Workplace as two products; Device onboarding

**Default setup**:
Workplace creation configured for the first Workplace: name/icon derived from the User; currency and starter accounts/categories are still asked in the same flow. Not a second wizard and not a silent stamp of defaults.
_Avoid_: Ghost Personal; skip Workplace creation; a third setup process

**Setup checkpoint**:
A resumable boundary in a Setup journey where the current slice output is accepted and must survive interruption. Checkpoints retain whether each fact was entered, imported, existing, or defaulted.
_Avoid_: screen; page; draft step

**Setup summary**:
The final review of the accepted slice outputs before Setup acceptance. Auto-completed facts remain visible; Change opens the owning slice directly and returns to the summary after dependent facts are revalidated.
_Avoid_: completion splash; success screen; dashboard preview

**Workplace setup confirmation**:
The checkpoint that accepts temporary Workplace configuration within a Setup journey. During fresh setup it does not create a Workplace or write ledger data.
_Avoid_: database commit; Setup acceptance; Workplace publication

**Setup acceptance**:
The final user action that accepts the Setup summary and authorizes app entry. In fresh setup it publishes the Workplace and commits User appearance; after restore it activates the already-published imported Workplace and commits the accepted User choices.
_Avoid_: Device registration; Workplace setup confirmation; universal database commit; finish

**Setup draft**:
The temporary, versioned, resumable state held before Setup acceptance. It contains the journey recipe, accepted slice outputs and their provenance, and any operation identity needed to resume safely; it is not ledger data.
_Avoid_: partial Workplace; temporary Workplace; database draft

**Setup fact provenance**:
The source of a value offered to a Setup slice: User-entered, imported, existing, or defaulted. A slice may auto-complete only from authoritative facts that satisfy all of its requirements; a default never conceals a missing required fact.
_Avoid_: inferred completion; truthy field; fallback as supplied data

**Restore setup**:
A blocking Setup journey that uses a Workplace restore before resolving the setup requirements needed for app entry. Imported facts prefill or auto-complete their owning slices; a missing User name still requires Device setup, Appearance setup is always shown during first run, and Setup acceptance activates the Workplace. Workplace identity remains editable, while imported books remain unchanged until normal app use.
_Avoid_: Imported onboarding; import completion; direct-to-dashboard import

**Workplace restore**:
The operation that owns restore-source selection, validation, required pre-publication corrections, private Workplace publication, and its Restore handoff. First-run Restore setup, the Workplace picker, and Settings may use it without sharing unrelated User or Appearance setup.
_Avoid_: User restore; Device restore; onboarding import; in-place Workplace replacement

**Restore source**:
The backup or supported external file selected for a Restore setup. It may be parsed and validated before publication; missing publication-critical facts such as base currency must be resolved rather than silently defaulted.
_Avoid_: imported Workplace; active books; arbitrary fallback currency

**Staged restore**:
A validated restore operation that has not yet published a Workplace because required publication facts remain unresolved. It is operation state, not usable books.
_Avoid_: temporary Workplace; partially imported Workplace; active restore

**Restore handoff**:
The accepted result of a restore operation: its identity, published Workplace, available User, Workplace, and appearance facts with provenance, and any warnings. It carries no navigation, Device-registration, User-preference, or activation decision.
_Avoid_: import stats as setup state; restored global preferences; route parameters as handoff

**Restore summary**:
The resumable slice that acknowledges the restored Workplace and any warnings before the caller continues setup, activates it, opens it, or stays in the current context. Failure to read the restored Workplace blocks acceptance and offers retry or explicit discard.
_Avoid_: transient success screen; import complete as app entry

**Workplace replacement**:
The maintenance operation that replaces one existing Workplace's books from a backup while preserving its identity in the surrounding app flow. It reuses restore parsing and validation but is not a Setup journey or a Workplace restore.
_Avoid_: Restore setup; new Workplace import; Setup acceptance

**Discard restore**:
The explicit, confirmed abandonment of an inactive Workplace created by the current restore operation. App termination or Back never implies discard.
_Avoid_: cancel import; automatic rollback after publication; deleting an unrelated Workplace

**Appearance setup**:
The Setup slice where the User confirms theme and font. Valid imported appearance prefills the slice but never skips it during first run; changes remain in the Setup draft until Setup acceptance.
_Avoid_: Theme onboarding; Device theme; immediate preference write

**Appearance preview**:
The temporary theme and font presentation scoped to Appearance setup. It changes no User preference and disappears when Setup is discarded; Setup acceptance writes the confirmed appearance.
_Avoid_: saved theme; preference rollback; Device appearance

**Starter account**:
An Account selected or added during Workplace setup as part of the initial ledger configuration. Setup supports asset and liability starter accounts; income and expense choices belong to starter categories.
_Avoid_: wallet; category account

**Starter category**:
An income or expense category selected or added during Workplace setup as part of the initial ledger configuration.
_Avoid_: account; tag

**Full setup**:
Workplace creation configured for every later Workplace: name, icon, currency, starter accounts, and categories are asked.
_Avoid_: Default setup

**Workplace onboarding**:
Default setup within a first-run Setup journey. This is product shorthand only; the domain operation is Workplace creation configured as Default setup.
_Avoid_: Device setup; User setup; a separate Workplace-creation product

**Active workplace**:
The Workplace this Device currently has open. Stored on the Device. May be unset or point at a Workplace that no longer exists.
_Avoid_: Default workplace; session workplace (as a fake id)

**Workplace picker**:
Shown when Device setup is complete, Active workplace is missing or invalid, and **two or more** Workplaces exist. If exactly one Workplace exists, it is opened and written as Active workplace — no picker. If none exist, Workplace creation or Workplace restore runs instead.
_Avoid_: Device setup; ensure-default-on-launch

**Device recovery**:
Repairing Device registration and Active workplace from durable local evidence when Device preferences are missing or invalid. Existing Workplaces may prove prior registration; zero Workplaces never do. Recovery does not create or modify a Workplace.
_Avoid_: ensureDefaultWorkplace; onboarding-complete repair; synthesizing registration with zero books

**Device session**:
The current visit on a Device: unlocked-or-locked, app active. Ephemeral. Not persisted preferences.
_Avoid_: Device (the install); User

### Inbox

**Device inbox**:
The Device-scoped feed of incoming SMS. One list on this install; the same messages regardless of which Workplace is open. Does not hold journals. Not included in native Workplace export.
_Avoid_: Workplace inbox (as the feed); SMS import (as the feed’s name)

**Workplace inbox**:
This Workplace’s copies of SMS it has consumed (posted to a journal, or dismissed in this Workplace). Not a second feed of pending messages. Travels with native Workplace export. Dies with the Workplace; Device inbox tags follow remaining copies.
_Avoid_: Device inbox; cloning the phone’s SMS per Workplace as the pending list

**Elsewhere-consumed**:
A Device inbox message already consumed by another Workplace. Still shown in the Device inbox with a tag naming that Workplace. Manual consume in this Workplace is always allowed.
_Avoid_: Hidden; processed (as “gone from this Workplace”)

**Cross-workplace auto-post**:
Workplace preference: auto-post Elsewhere-consumed messages into this Workplace. Off means auto-post skips them; the User can still post by hand. Two Workplaces may both consume the same SMS.
_Avoid_: Resurface; show consumed as pending (the feed already shows them)

**Device SMS listen**:
Device preference: this install may scan the OS SMS inbox and run auto-post. Default **off** on a fresh Device; the User turns it on. Off is Device-wide — no Workplace can listen independently. OS SMS permission is also Device.
_Avoid_: Per-Workplace SMS import enabled; workplace participates; scan during Device setup

### Interaction

**Selection mode**:
A transient UI mode on a list or detail surface where the user multi-selects items for bulk actions (share, delete, clear). Entered by long-press; exited by back, tap-outside, or an explicit exit action. While active, nav chrome dims, FAB is muted, and back exits the mode instead of navigating.
_Avoid_: Command mode, selection chrome (as the name of the mode itself — chrome is how the mode presents)

**Selection-mode chrome**:
The coordinated presentation of Selection mode: nav (dim, back→exit, FAB mute), bulk action bar, and dismiss-to-exit affordances.
_Avoid_: applySelectionChrome (implementation helper name); command mode bar

### Journal list

**Journal list**:
The Activity tab’s journal feed: date-scoped journal entries with Selection mode, period bar, and share. One presentation module over the shared journal pipeline (`useJournalEntryList`).
_Avoid_: Journal list screen helper / reshape adapter as a separate concept; search-global on the Activity tab (search is its own screen)

**Journal entry row**:
A single row in a journal list representing one whole journal entry (`EnrichedJournal`). Identity is always `JournalId`. Shown on Activity, Dashboard, Search, and Insights.
_Avoid_: Calling it a "transaction" in list/UI code

**Journal entry card**:
Shared card UI for journal list rows (`JournalEntryCard`). Same component for Activity and account-filtered views; account perspective is a viewer lens on the mapper, not a separate card type.
_Avoid_: Separate ledger card component

**Viewer lens**:
Optional `{ accountId }` passed to the journal timeline mapper. When set, card amount/badges/chrome reflect that account’s leg on the journal. Details screen still loads the full journal.

**Journal details**:
Screen opened from any journal entry card. Loads by `journalId`; shows full journal including all split lines. Route: `/journal-details`.

**Insight detail list**:
Journal entries linked to an insight. Uses the same `useJournalEntryList` pipeline with a `journalIds` filter.

**Insight**:
A detected financial pattern surfaced in Hub (e.g. recurring charge, spending spike, missing emergency fund). Carries severity, short message, explanatory description, suggestion, and optional linked journals.
_Avoid_: Notification, alert, tip (for this Hub concept)

**Insight amount**:
The monetary impact of an Insight when it has one. A distinct field from description — never embedded as formatted text inside description prose.
_Avoid_: formattedAmount inside description strings

**Insight description**:
Human-readable reason prose for why an Insight appeared. Contains no monetary figures.
_Avoid_: Preformatted money in copy

### Accounts

**Account**:
A workplace-scoped ledger bucket (asset, liability, equity, income, or expense) that journal lines post to. May form a parent/child hierarchy; only leaf accounts receive transactions.
_Avoid_: Wallet (as the domain term for any account); category (except for income/expense account types in user-facing copy)

**Archived account**:
An account marked archived so it is hidden from default account lists and pickers. Still fully live for balances, reporting, posting, and references — archive is a visibility preference, not removal.
_Avoid_: Deleted account; inactive account; hidden account (as the canonical term)

**Archive**:
The act of marking an account archived. Distinct from delete: archive never removes history or blocks references; delete is a separate, reference-guarded soft-delete.
_Avoid_: Deactivate; hide (as the verb — use archive)

**Show archived**:
An ephemeral toggle on account list and picker surfaces. Off by default; resets each time the surface opens. When on, archived accounts appear with muted styling and an archive icon.
_Avoid_: Include inactive; show hidden

**Archive cascade**:
When archiving or unarchiving an account that has descendants, a confirmation dialog listing the account tree (parents and leaves, hierarchy indented). The user selects which nodes to include; nothing cascades without explicit selection.
_Avoid_: Archive all; cascade archive (as automatic behavior)

**Account tree**:
The complete hierarchy of accounts in one account type, including archived accounts, where each account belongs to exactly one ordered sibling list under a parent or at the root.
_Avoid_: flat account order; global account order

**Sibling list**:
The ordered children of one parent account, or the ordered root accounts when there is no parent. Positions are scoped to that list and do not compare across parents.
_Avoid_: global position; category position

**Subtree move**:
A tree operation that changes an account’s parent while preserving that account’s descendants, their parent links, and their relative sibling order.
_Avoid_: move-and-flatten; reattach children

### Time display

**Hour cycle**:
Whether clock hours are presented in a 12-hour cycle or a 24-hour cycle. A display concern only; stored journal times and editor `HH:mm` values stay 24-hour. Date patterns on a screen (`DD MMM YYYY` vs `MMM D, YYYY`) are not part of hour cycle.
_Avoid_: Time format (when meaning 12 vs 24); clock format

**Hour cycle preference**:
The user’s choice of hour cycle: system, 12-hour, or 24-hour. Default is system. App-wide. Lives under Appearance, beside theme mode. A regular-weight hint next to the Time heading shows `System(12 hour)` / `System(24 hour)` when following the OS, or `12 Hour` / `24 Hour` when overridden. Applies to every human-readable clock (UI, share copy, notification text we write), including the time picker. Canonical file fields stay 24-hour `HH:mm` / ISO.
_Avoid_: Device-level time format; time format preference; workplace-scoped clock

**System hour cycle**:
The device OS 24-hour clock setting. If the OS does not report it, the 12-hour cycle is used. Not the locale’s typical cycle (e.g. `en-US` vs `de-DE`). Re-read when the app becomes active (cheap sync API). On iOS the OS value is frozen for the process lifetime.
_Avoid_: Locale hour cycle (as the meaning of system)

**Resolved hour cycle**:
The 12-hour or 24-hour cycle in effect after applying Hour cycle preference to System hour cycle.

**12-hour clock**:
Hours 1–12 with English `AM` / `PM`. Midnight is 12:00 AM; noon is 12:00 PM. Labels use an unpadded hour (`2:05 PM`). The time picker is three wheels: hour 1–12, minute 00–59, AM/PM.

**24-hour clock**:
Hours 00–23. Labels are `14:05`. The time picker is two wheels: hour 00–23, minute 00–59.
