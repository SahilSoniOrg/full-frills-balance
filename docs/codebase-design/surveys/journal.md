# Journal / Ledger Module Audit

Vocabulary: **Module / Interface / Depth / Seam / Adapter / Leverage / Locality** (codebase-design skill).

---

## Cluster map

```
VMs (entry) ──save──► JournalService ──create──► LedgerWriteService ──prepare──► JournalRepository
                │              │ update/delete/post…                          ▲
                │              └──prepareJournalData──────────────────────────┘
                └──load via journalRepository (bypasses JournalService)

observe: useJournals → JournalService.observe* → journalEnrichedObserver → journalPresenter
         useLedgerTransactions → LedgerReadService → same observer
```

---

## Per-module

### `journalDomainService.ts` (`JournalService`, 733 LOC)

| | |
|---|---|
| **Depth** | **Uneven / wide.** Lifecycle verbs (`update`/`delete`/`recover`/`post`/`revert`/`reversal`/`duplicate`) hide real orchestration (audit + rebuild + status). `saveJournalEntry` / `saveBulk` are deep application commands. `observeEnrichedJournals` + `getJournalSuggestions` are **shallow pass-throughs**. |
| **Interface smells** | Bag-of-verbs (~11 methods, unrelated read/write/lifecycle); `save*` param bags (SMS fields, date\|string, mode); create via `ledgerWriteService`, update via `journalRepository` — callers must know the split; `SimpleEntryParams` exported but unused by class. |
| **Anemic vs god?** | Neither pure: **application god-facade** over write + lifecycle + thin reads. |
| **Dual ownership** | **Create** with `LedgerWriteService`; **enrichment observe** with `ledgerReadService` (same helper); **validation** with `prepareJournalData` + VMs; **load-for-edit** owned by `useJournalEditor` → repo. |
| **Deepen** | Collapse to one write seam (`JournalCommands`: save/update/lifecycle) and drop pass-through reads; keep observe behind a dedicated read module. |

---

### `journalEnrichedObserver.ts` (200 LOC, 1 fn)

| | |
|---|---|
| **Depth** | **Deep** for interface size: query assembly + raw enrich + semantic present + `distinctUntilChanged`. |
| **Interface smells** | Positional args sprawl (`limit`, `dateRange&accountIds`, `search`, `status`, `options`); Watermelon `Q` leaked into “service” layer; presenter coupling inside observe pipeline. |
| **Dual ownership** | Reaches into `journalRepository.journalsQuery` + `getEnrichmentDataRaw`; presentation dual with persisted `display_type` from `prepareJournalData`. |
| **Deepen** | Push filter/query into repo (`observeFiltered…`); observer becomes enrich+map only; one options object. |

---

### `ledger/*`

#### `ledgerReadService` (190 LOC)

| | |
|---|---|
| **Depth** | **Shallow facade.** ~10 methods are 1-line repo forwards; only `observeEnrichedForAccounts` adds mapping. |
| **Interface smells** | Mirrors repo surface (no leverage); deletion test fails for most methods. |
| **Dual ownership** | Second door into `observeEnrichedJournals` vs `journalService.observeEnrichedJournals`. |
| **Deepen** | Delete pass-throughs; keep only the account→`DisplayTransaction` adapter, or fold into journal read module. |

#### `ledgerWriteService` (87 LOC)

| | |
|---|---|
| **Depth** | **Deep create path** (`prepareJournalData` + audit ops + rebuild enqueue). |
| **Interface smells** | Incomplete write seam: create only; update/delete/post live on `JournalService`/`JournalRepository`. |
| **Dual ownership** | Canonical create for prod; `JournalRepository.createJournalWithTransactions` still used in tests (parallel adapter). |
| **Deepen** | Make this (or rename to JournalWrite) own **all** mutations; repo returns prepared ops only. |

#### `prepareJournalData` (104 LOC)

| | |
|---|---|
| **Depth** | **Deep.** Round → invariant → balance validate → running balances → displayType. |
| **Interface smells** | Clean (`CreateJournalData` → `PreparedJournalData`); good. |
| **Dual ownership** | DisplayType also recomputed in observer via `journalPresenter`. |
| **Deepen** | Keep as internal of write module; don’t re-export as free-floating unless write module owns it. |

#### `AccountResolutionService` (629 LOC)

| | |
|---|---|
| **Depth** | **Deep.** One `resolve(…)` hides fuzzy/synonym/history/classifier. |
| **Interface smells** | Fat params object OK; strategy enums in result are fine. |
| **Dual ownership** | None material with journal write path. |
| **Deepen** | Extract internal pure matcher (already mostly local); keep external seam as `resolve`. |

#### `TransactionExtractor` + registry (46 LOC)

| | |
|---|---|
| **Depth** | **Good real seam** (`canExtract`/`extract`); 2 adapters (Sms/Voice) justify it. |
| **Interface smells** | Registry throws; side-effect self-registration via `ledger/index` imports. |
| **Deepen** | Explicit register in composition root; keep port as-is. |

#### `SmsParser` (102 LOC)

| | |
|---|---|
| **Depth** | **Shallow–medium.** Maps extractor → inbox DTO + confidence/status. |
| **Interface smells** | Static class; hard-wired `SmsExtractor` (hard to swap). |
| **Deepen** | Pure `toParsedTransaction(ExtractedInfo, sms)` + inject extractor. |

#### `RuleMatcher` (163 LOC)

| | |
|---|---|
| **Depth** | **Deep.** Rule → predicate; pure, testable. |
| **Interface smells** | Static-heavy but coherent. |
| **Deepen** | Leave; already earns keep. |

---

### `journalPresenter.ts` (298 LOC, under `utils/`)

| | |
|---|---|
| **Depth** | **Deep domain module** misplaced: 5×5 semantic matrix + display/label/color. |
| **Interface smells** | Object-of-functions OK; “Presenter” in utils implies UI but used by **write path** (`prepareJournalData` sets `displayType`). |
| **Locality** | Wrong: domain classification in `utils/`; tests live under `services/accounting/`. |
| **Dual ownership** | Write-time `displayType` vs observe-time recompute of display/semantic fields. |
| **Deepen** | Move to `services/accounting` (or journal domain); single owner of classification; persist or derive, not both inconsistently. |

---

### `JournalRepository.ts` (1018 LOC, ~30 methods)

| | |
|---|---|
| **Verdict** | **God-Module persistence adapter, not classic anemic.** Fat write choreography (`updateJournalWithTransactions`, `replaceJournalWithReversal`) + SMS fingerprint/nearby + enrichment raw + many observes/finds. Interface is **shallow relative to size**: callers learn ~30 methods and invariants (`PrepareCreateJournalData` must already have balances/displayType; `extraOpCreator`; soft-delete+recreate). |
| **Anemic?** | **No** for writes (batch ops, reversal replace). **Yes** for domain rules (validation/balances live above). Worst of both: **god surface + leaked domain prep contract**. |
| **Interface smells** | Unbounded query surface (`journalsQuery(...clauses)`); create path duplicated with `ledgerWriteService`; SMS/inbox concerns in journal repo; observe vs command mixed. |
| **Dual ownership** | Write ops with `LedgerWriteService`/`JournalService`; enrichment query with observer. |
| **Deepen** | Split: `JournalStore` (CRUD/ops prepare), `JournalQueries` (observe/find), `JournalSmsIndex` (fingerprint/nearby); domain never imports query bag. |

---

### Entry view-models

#### `useJournalEditor` (545 LOC)

| | |
|---|---|
| **Depth** | **Shallow–fat controller.** Large UI state + FX + balance + submit; little unique domain beyond wiring. |
| **Interface smells** | Huge options + return surface; loads via **`journalRepository` + `transactionService`**, saves via **`journalService`** (split ownership). |
| **Dual ownership** | Semantic type inference for simple/advanced on load duplicates presenter logic; validation overlaps `saveJournalEntry`. |
| **Deepen** | Editor = form state only; `loadJournalForEdit(id)` + `save` as domain commands; FX in shared helper. |

#### `useSimpleJournalEditor` (512 LOC)

| | |
|---|---|
| **Depth** | Medium for UI (sections, prefs, cross-currency), but **FX algorithm duplicated** with bulk. |
| **Interface smells** | Depends on full `editor` return type; section building is UI-local (OK). |
| **Deepen** | Extract `useCrossCurrencyRates` shared with bulk; keep sections here. |

#### `useBulkJournalEditor` (375 LOC)

| | |
|---|---|
| **Depth** | Medium; line-building + validate + `saveBulk` map is re-owned application logic. |
| **Interface smells** | Parallel mini-domain (`BulkJournalRow` ↔ `JournalEntryLine`); validate overlaps service. |
| **Deepen** | Row→lines mapper + shared FX; leave grid state in hook. |

#### `useJournalEntryViewModel` (396 LOC)

| | |
|---|---|
| **Depth** | **Shallow composition root** by nature (~40-field interface). Acceptable as screen adapter if thin. |
| **Interface smells** | God-return for `EntryScreen`; SMS finalize still here (vs M-9 `onAfterSave` on editor — partial). |
| **Dual ownership** | Validity rules again (simple/advanced); mode orchestration only place that should stay. |
| **Deepen** | Shrink to mode + submit + picker; don’t re-export every child field. |

---

## Cross-cutting findings

| Theme | Finding |
|---|---|
| **Write seam** | No single Module owns journal mutation. Create=`LedgerWriteService`, update/lifecycle=`JournalService`, atomic reverse-replace=`JournalRepository`. |
| **Read seam** | Enrichment entered via `journalService` *and* `ledgerReadService`; both wrap one deep helper. |
| **Leverage** | Highest: `prepareJournalData`, `journalPresenter` matrix, `AccountResolutionService.resolve`, `RuleMatcher`. Lowest: `LedgerReadService` forwards, `JournalService` observe/suggestions wrappers. |
| **Locality** | FX rates, line assembly, balance checks, display classification spread across VMs + service + utils + observer. |
| **Real seams** | `TransactionExtractor` (2 adapters) ✓; hypothetical seams elsewhere (repo “port” with one Watermelon adapter). |

---

## Priority deepen order (1 line each)

1. **Unify write Module** — one command interface; repo = prepared ops + queries only.  
2. **Split `JournalRepository`** — stop the 30-method god surface.  
3. **Relocate `journalPresenter`** — domain module; one classification owner.  
4. **Delete/thin `LedgerReadService` pass-throughs** — keep account display adapter or merge.  
5. **Slim entry VMs** — shared FX + domain load/save; VM = React state.