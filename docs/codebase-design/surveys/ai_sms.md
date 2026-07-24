# Codebase-design survey: AI / LLM, SMS / ingestion, platform utils

**Verdict:** CONTEXT vocabulary for **Pipeline** matches the code. **LLMEngine** exists, but the named **Inference Adapter** (`LiteRTAdapter`) does not — production uses `SmallModelProvider` only. Pipeline steps are real Modules behind a small `ingest()` Interface. LLMEngine is a **hypothetical** production Seam (one Adapter); `TransactionFallbackAIProvider` is a **real** Seam (two Adapters).

---

## CONTEXT vocabulary vs code

| CONTEXT term | Code reality |
|---|---|
| **LLMEngine** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/ai/types.ts` — `generate`, optional `generateStream`, `dispose` |
| **Inference Adapter** / `LiteRTAdapter` | **Mismatch.** Only production Adapter is `SmallModelProvider` (`implements DynamicLLMEngine`). No `LiteRTAdapter` type/file. |
| **Pipeline** | `TransactionIngestionService` — ordered steps over a transcript |
| **PipelineStep** | `execute(context: PipelineContext): Promise<void>` — halt via `context.isHalted` |
| **PipelineContext** | Mutable bag: transcript, workplace, accounts, parsed/resolved, result, `aiProvider` |

Two separate “pipelines” in the repo:
1. **Transcript Pipeline** (voice / AI ingestion) — CONTEXT’s Pipeline
2. **SmsSyncPipeline** — SMS inbox → parse → dedupe → auto-post (no `PipelineStep`)

---

## Cross-cutting findings

### Pipeline steps as deep Modules?

**External Interface is deep:** `ingest(transcript, workplaceId, forceAi?) → ParserOutput`.

**Internal steps are mixed:**
| Step | Depth | Notes |
|---|---|---|
| `ContextGatheringStep` | Shallow | DB + workplace currency load |
| `DeterministicStep` | Moderately deep | Extractor + resolution + confidence halt |
| `AiFallbackStep` | Moderately deep | AI call, timeout, second-pass resolution, fallback |

Steps share a **large mutable `PipelineContext`** — callers of steps must know the bag’s shape and ordering. Depth of the cluster lives in the orchestrator Interface, not each step’s Interface.

### LLMEngine Seam — real second Adapter?

**No second production Adapter.**

| Adapter | Role |
|---|---|
| `SmallModelProvider` | Sole production `DynamicLLMEngine` |
| Jest mock `LLMEngine` | Test-only, injected into `NativeAIProvider` |

Per deepening rule: **one Adapter = hypothetical Seam.** Production never swaps engines. Test injection justifies an *internal* Seam for `NativeAIProvider`, not a product-level multi-Adapter Seam.

**Real Seam nearby:** `TransactionFallbackAIProvider` has `NativeAIProvider` + `MockTransactionFallbackAIProvider` (+ `setAiProvider` override).

### Shallow facades / re-exports in utils

| Path | Verdict |
|---|---|
| `src/utils/journalStatus.ts` | Trivial constant Module |
| `src/utils/dateHelpers.ts` `getNow` / `getPerfNow` | Pass-through wrappers |
| `src/utils/money.ts` `formatCurrency` | Redirects to `CurrencyFormatter` |
| `src/utils/test-utils.tsx` | Re-exports `@testing-library/react-native` |
| `src/services/sms-service.ts` | Large facade: many methods only forward to bridge/pipeline/rules |
| `src/services/transaction-ingestion/index.ts` | Barrel only (fine) |
| `src/utils/TraceService.ts` | `TraceService.startTrace` ≈ `new Trace` |

No utils files that *only* re-export other Modules wholesale, except `test-utils` and the SMS barrel re-exports.

---

## AI / LLM Modules

### 1. LLMEngine (Interface Module)

| Field | Detail |
|---|---|
| **Name** | LLMEngine / DynamicLLMEngine |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/ai/types.ts` |
| **Interface size** | Small: `generate`, optional `generateStream`, `dispose`, optional `getMemorySummary`; Dynamic adds `switchModel`, `getLoadedModelId` |
| **Depth verdict** | **Deep Interface** (as designed) — hides load/unload/backends |
| **Deletion test** | Complexity reappears in every caller of LiteRT → earns keep |
| **Dep category** | True external (LiteRT native) — mock in tests |
| **Seams** | External Seam for inference; only one production Adapter |
| **Coupling smells** | CONTEXT name `LiteRTAdapter` unused; `getMemorySummary(): any` leaks |

### 2. SmallModelProvider (Inference Adapter)

| Field | Detail |
|---|---|
| **Name** | SmallModelProvider |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/ai/SmallModelProvider.ts` (~257 LOC) |
| **Interface size** | `DynamicLLMEngine` + singleton; constructor takes default model id |
| **Depth verdict** | **Deep** — RAM checks, backend selection, load/switch, busy lock, think-tag strip, stats |
| **Deletion test** | LiteRT lifecycle spills into NativeAIProvider / UI |
| **Dep category** | True external (`react-native-litert-lm`) + Local-substitutable catalog via `ModelManagementService` |
| **Seams** | Satisfies LLMEngine; hard-wired to `modelManagementService` singleton |
| **Coupling smells** | Hard dependency on ModelManagementService; JSON-only prompt prepend in `generate`; no alternate Adapter |

### 3. ModelManagementService

| Field | Detail |
|---|---|
| **Name** | ModelManagementService |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/ai/ModelManagementService.ts` (~328 LOC; large `SUPPORTED_MODELS` catalog) |
| **Interface size** | Medium–large: catalog, download, progress listeners, custom models, delete, recommend |
| **Depth verdict** | **Moderately deep** — download/cache/progress/custom models behind catalog ops |
| **Deletion test** | Catalog + HF token + `ModelRegistry` reappear in UI and provider |
| **Dep category** | True external (HF / ModelRegistry) + Local (MMKV for custom models) |
| **Seams** | None typed — concrete singleton |
| **Coupling smells** | Catalog embedded in same Module as download logic; UI imports singleton directly |

### 4. NativeAIProvider

| Field | Detail |
|---|---|
| **Name** | NativeAIProvider |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/NativeAIProvider.ts` (~351 LOC) |
| **Interface size** | `TransactionFallbackAIProvider.parse` (+ `unload`, `abort`) |
| **Depth verdict** | **Deep** — single/multi-pass, JSON parse, request abort, metrics |
| **Deletion test** | Prompt orchestration + pass logic reappear at AiFallbackStep |
| **Dep category** | In-process over injected LLMEngine (testable); production wires `smallModelProvider` |
| **Seams** | Constructor Seam on `LLMEngine` (used in tests); implements FallbackAI Seam |
| **Coupling smells** | Default singleton binds to `smallModelProvider`; LiteRT error string matching |

### 5. MockTransactionFallbackAIProvider

| Field | Detail |
|---|---|
| **Name** | MockTransactionFallbackAIProvider |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/TransactionFallbackAIProvider.ts` (~34 LOC) |
| **Interface size** | Same `parse` Interface |
| **Depth verdict** | Shallow by intent (test/prod-off stub) |
| **Deletion test** | When native AI off, need another stub |
| **Dep category** | In-process |
| **Seams** | Second Adapter at TransactionFallbackAIProvider |
| **Coupling smells** | Magic string `"mock ai success"` |

### 6. ai-prompts

| Field | Detail |
|---|---|
| **Name** | ai-prompts |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/utils/ai-prompts.ts` (~62 LOC) |
| **Interface size** | 3 prompt builders |
| **Depth verdict** | Shallow–moderate (pure strings; valuable Locality for prompt text) |
| **Deletion test** | Prompt strings scatter into NativeAIProvider |
| **Dep category** | In-process |
| **Seams** | None |
| **Coupling smells** | None significant |

### 7. AI parsing types

| Field | Detail |
|---|---|
| **Name** | ai-parsing types / TransactionFallbackAIProvider |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/types/ai-parsing.ts` |
| **Interface size** | `ParserOutput`, `AIContext`, `TransactionFallbackAIProvider.parse` |
| **Depth verdict** | Types only — small, good Seam definition |
| **Deletion test** | Types would reappear inline |
| **Dep category** | n/a |
| **Seams** | Defines FallbackAI Seam |
| **Coupling smells** | `debugMetrics.memorySummary?: any` |

---

## Transcript Pipeline Modules

### 8. TransactionIngestionService (Pipeline orchestrator)

| Field | Detail |
|---|---|
| **Name** | TransactionIngestionService |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/TransactionIngestionService.ts` (~66 LOC) |
| **Interface size** | **Small:** `ingest(...)`, `setAiProvider(...)` |
| **Depth verdict** | **Deep** — hides 3 steps, provider selection, halt semantics |
| **Deletion test** | Step wiring + provider choice reappear (e.g. `VoiceInputModal`) |
| **Dep category** | Mix: DB via steps, AI via provider Seam, preferences |
| **Seams** | Pipeline Interface; FallbackAI via `setAiProvider` / preferences |
| **Coupling smells** | `getEffectiveAiProvider` fire-and-forgets `switchModel` without await; steps hardcoded |

### 9. Pipeline types

| Field | Detail |
|---|---|
| **Name** | PipelineContext / PipelineStep |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/pipeline/types.ts` |
| **Interface size** | Step Interface tiny; Context bag **large** |
| **Depth verdict** | Step Interface deep-capable; Context is a **wide shared mutable Seam** |
| **Deletion test** | Explicit params explode across steps |
| **Dep category** | n/a |
| **Seams** | Internal step Seam |
| **Coupling smells** | Steps must know which fields prior steps filled |

### 10–12. Pipeline steps

**ContextGatheringStep** — `/.../pipeline/steps/ContextGatheringStep.ts` (~19 LOC)  
- Interface: `PipelineStep`  
- Depth: **Shallow**  
- Deps: Local-substitutable (WatermelonDB)  
- Smell: Direct `database` + `workplaceService`

**DeterministicStep** — `/.../pipeline/steps/DeterministicStep.ts` (~90 LOC)  
- Depth: **Moderate–deep** (extract → resolve → confidence halt)  
- Deps: In-process extractors + Local DB via AccountResolutionService  
- Smell: Hardcodes `channel: 'voice'` even for generic transcript Pipeline

**AiFallbackStep** — `/.../pipeline/steps/AiFallbackStep.ts` (~118 LOC)  
- Depth: **Moderate–deep**  
- Deps: Injected `aiProvider` on context (good); preferences for mode  
- Smell: 20s timeout race hardcoded; duplicates resolution logic with DeterministicStep

### Supporting ledger Modules used by Pipeline (significant)

| Module | Path | Interface | Depth | Dep | Smells |
|---|---|---|---|---|---|
| TransactionExtractor registry | `src/services/ledger/TransactionExtractor.ts` | `canExtract` / `extract` + registry | Moderate — real Seam, 2 Adapters (Voice, Sms) | In-process | Channel registry is real Seam |
| VoiceExtractor | `.../VoiceExtractor.ts` (~168) | TransactionExtractor | Deep-ish regex/heuristic parse | In-process | Side-effect register at import |
| SmsExtractor | `.../SmsExtractor.ts` (~161) | TransactionExtractor | Deep-ish | In-process | SmsParser constructs **own** instance, bypassing registry |
| AccountResolutionService | `.../AccountResolutionService.ts` (~629) | `resolve(...)` | **Deep** | Local DB | Large; Pipeline couples tightly |

### Mislocated: TransactionService

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/transaction-ingestion/TransactionService.ts` (~231 LOC) |
| **Role** | Journal transaction enrichment / observe — **not** transcript ingestion |
| **Depth** | Moderate |
| **Smell** | Lives under `transaction-ingestion` package; naming/locality confusion |

---

## SMS / inbox Modules

### 13. SmsSyncPipeline

| Field | Detail |
|---|---|
| **Name** | SmsSyncPipeline |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/sms/SmsSyncPipeline.ts` (~504 LOC) |
| **Interface size** | Medium–large: `scanInbox`, fingerprint, status resolution, mark processed, etc. |
| **Depth verdict** | **Deep** — scan, parse, fingerprint, duplicate, auto-post, inbox write |
| **Deletion test** | Entire SMS import loop reappears |
| **Dep category** | Local DB + True external SMS via bridge |
| **Seams** | Uses concrete `smsInboxBridge`, `smsRuleEngine`, `SmsParser` — few typed Seams |
| **Coupling smells** | Not CONTEXT Pipeline; god-class tendency; duplicates processed-ID key with SmsService |

### 14. SmsRuleEngine

| Field | Detail |
|---|---|
| **Name** | SmsRuleEngine |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/sms/SmsRuleEngine.ts` (~343 LOC) |
| **Interface size** | Large: match, preview, suggestions, CRUD, merge prep |
| **Depth verdict** | **Moderately deep** |
| **Deletion test** | Rule logic reappears in settings + sync |
| **Dep category** | Local DB + In-process RuleMatcher |
| **Seams** | Relies on ledger `RuleMatcher` |
| **Coupling smells** | Wide Interface; SmsService forwards many methods unchanged |

### 15. SmsInboxBridge

| Field | Detail |
|---|---|
| **Name** | SmsInboxBridge |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/sms/SmsInboxBridge.ts` (~38 LOC) |
| **Interface size** | Small: `getLatestMessages(limit)` |
| **Depth verdict** | **Moderate** for size — permission + platform gate + native call |
| **Deletion test** | Permission/native plumbing reappear |
| **Dep category** | True external (Android SMS) |
| **Seams** | Thin Adapter over `expo-sms-inbox`; **one** Adapter → hypothetical Seam |
| **Coupling smells** | Android-only throw |

### 16. SmsParser

| Field | Detail |
|---|---|
| **Name** | SmsParser |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/ledger/SmsParser.ts` (~100 LOC) |
| **Interface size** | `SmsParser.parse(sms)` static |
| **Depth verdict** | Moderate — maps extractor → inbox statuses |
| **Deletion test** | Status mapping reappears in sync |
| **Dep category** | In-process |
| **Seams** | Should sit on TransactionExtractor Seam; currently owns private `SmsExtractor` |
| **Coupling smells** | Bypasses `transactionExtractorRegistry` |

### 17. SmsService (facade)

| Field | Detail |
|---|---|
| **Name** | SmsService |
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/sms-service.ts` (~268 LOC) |
| **Interface size** | **Very large** (~20+ methods) + re-exports of types/classes |
| **Depth verdict** | **Shallow facade** for many methods; some real logic (observeInbox, link, status) |
| **Deletion test** | Pass-throughs vanish; inbox observe / link logic remains elsewhere |
| **Dep category** | Aggregation of bridge/pipeline/rules |
| **Seams** | None — consolidates call sites |
| **Coupling smells** | Classic shallow Module: Interface ≈ Implementation; duplicates `@processed_sms_ids` |

### 18. expo-sms-inbox (native Module)

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/modules/expo-sms-inbox/src/` |
| **Interface size** | Tiny: `getSmsInbox(limit)` |
| **Depth** | Deep on native side; shallow JS stub |
| **Dep** | True external OS |
| **Seam** | Platform Adapter for SmsInboxBridge |

---

## Widget Modules

### 19. ExpoWidgets + useWidgetSync

| Field | Detail |
|---|---|
| **Name** | ExpoWidgets / Widget sync |
| **Paths** | `modules/expo-widgets/src/ExpoWidgetsModule.ts`, `ExpoWidgets.types.ts`; JS orchestration in `src/features/app/hooks/useWidgetSync.ts`; native `ExpoWidgetsModule.kt` |
| **Interface size** | Small native: `syncWidgetData`, `refreshWidgets`; snapshot types ~3 structs |
| **Depth verdict** | Native Module **deep**; JS hook **moderate** (theme color math + SafeToSpend → snapshot) |
| **Deletion test** | Widget data plumbing reappears in app root |
| **Dep category** | True external (Android AppWidget) |
| **Seams** | Typed `WidgetDataSnapshot` is a good small Interface |
| **Coupling smells** | Color mixing lives in feature hook, not a dedicated Module; no second Adapter (iOS stub?) |

---

## Exchange / money / preferences / snapshot / trace / remaining utils

### 20. ExchangeRateService

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/services/exchange-rate-service.ts` (~298 LOC) |
| **Interface size** | Medium: `getRate`, `getRateSafe`, `fetchRatesForBase`, `convert`, `syncTodayRates`, `preWarmCache` |
| **Depth verdict** | **Deep** — memory/DB/network tiers, in-flight dedupe, graceful 1.0 fallback |
| **Deletion test** | Caching/fetch races reappear |
| **Dep category** | True external (exchangerate-api) + Local DB repo |
| **Seams** | No typed port for HTTP — concrete `fetch` |
| **Coupling smells** | Silent 1.0 fallback hides failures; one Adapter only |

### 21. Money (+ CurrencyFormatter)

| Field | Detail |
|---|---|
| **Paths** | `src/utils/money.ts` (~126), `src/utils/currencyFormatter.ts` (~145) |
| **Interface size** | Money: value object + helpers; CurrencyFormatter: format/symbol surface |
| **Depth** | Money math **deep** (precision); `formatCurrency` **shallow** redirect |
| **Dep** | In-process |
| **Smell** | Dual formatting entry points |

### 22. Preferences

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/utils/preferences.ts` (~557 LOC) |
| **Interface size** | **Huge** — `UIPreferences` (~25 fields) + per-field getters/setters + observe + migration |
| **Depth verdict** | Implementation has real work (sanitize, migrate, Rx), but Interface is **shallow-wide** (N getters ≈ N fields) |
| **Deletion test** | Persistence + migration reappear; per-key accessors would not |
| **Dep category** | Local (MMKV) |
| **Seams** | None |
| **Coupling smells** | Kitchen-sink preferences; AI/SMS flags mixed with theme/font; Leverage would rise with smaller grouped Interfaces |

### 23. SnapshotService

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/utils/SnapshotService.ts` (~205 LOC) |
| **Interface size** | Medium: dashboard/wealth/custom save/get + clear |
| **Depth verdict** | **Moderate–deep** — Map/Set/WDB replacer, TTL, workplace isolation |
| **Deletion test** | Instant-boot correctness logic reappears |
| **Dep category** | Local (MMKV) |
| **Seams** | None |
| **Coupling smells** | `any` payloads; key conventions informal |

### 24. Trace / TraceService

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/utils/TraceService.ts` (~81 LOC) |
| **Interface size** | `Trace` methods + `traceService.startTrace` |
| **Depth** | `Trace` moderate; `TraceService` **shallow** factory |
| **Dep** | In-process over logger |
| **Smell** | TraceService barely earns keep |

### 25. Storage

| Field | Detail |
|---|---|
| **Path** | `/Users/sahilsoni/me/projects/full-frills-balance/src/utils/storage.ts` (~78 LOC) |
| **Interface** | Exported MMKV instance + `migrateFromAsyncStorage` |
| **Depth** | Migration **moderate**; `storage` export is raw Adapter leak |
| **Dep** | Local-substitutable |
| **Smell** | Callers couple to MMKV Interface directly |

### Other utils (brief)

| Module | Path | Size | Depth | Notes |
|---|---|---|---|---|
| dateUtils | `src/utils/dateUtils.ts` | ~384 / many exports | Wide Interface, deep calendar logic | Large surface |
| dateHelpers | `src/utils/dateHelpers.ts` | ~25 | Shallow for clocks | Split from dateUtils |
| journalPresenter | `src/services/accounting/journalPresenter.ts` | ~298 | Moderate–deep | Presentation mapping |
| journalStatus | `src/utils/journalStatus.ts` | 3 | Trivial | Constant Module |
| accountCategory | `src/utils/accountCategory.ts` | ~194 | Moderate | Domain helpers |
| accountIcon / accountSubtypeUtils | utils | small | Shallow–moderate | Lookup tables |
| logger | `src/utils/logger.ts` | ~182 | Moderate | Cross-cutting |
| errors | `src/utils/errors.ts` | ~70 | Shallow–moderate | Error hierarchy |
| alerts | `src/utils/alerts.ts` | ~316 | Moderate | Listener Seam for UI |
| auth | `src/utils/auth.ts` | ~102 | Moderate | LocalAuth Adapter |
| haptics | `src/utils/haptics.ts` | ~28 | Shallow | Platform thin wrap |
| files / compression | `*.ts` + `*.web.ts` | — | Moderate | **Real** platform Seam (2 Adapters) |
| navigation | `src/utils/navigation.ts` | ~710 | Wide | AppNavigation bag |
| validation | `src/utils/validation.ts` | ~74 | Moderate | In-process |
| dbGuardrails | `src/utils/dbGuardrails.ts` | ~24 | Small deep | Batch chunking |
| hashUtils | `src/utils/hashUtils.ts` | ~12 | Tiny deep | DJB2 |
| rxjs-operators | `src/utils/rxjs-operators.ts` | ~17 | Tiny deep | `firstFastDebounce` |
| scheduler | `src/utils/scheduler.ts` | ~20 | Shallow–moderate | Idle/InteractionManager |
| serialization | `src/utils/serialization.ts` | ~33 | Shallow–moderate | safeParseJSON |
| style-helpers / color-math | utils | ~92 / ~101 | Moderate | UI theming math |

---

## Architecture map (Seams that matter)

```
VoiceInputModal
    └─ TransactionIngestionService.ingest()     ← Pipeline Interface (deep)
           ├─ ContextGatheringStep
           ├─ DeterministicStep
           │     └─ TransactionExtractor (Voice) + AccountResolutionService
           └─ AiFallbackStep
                 └─ TransactionFallbackAIProvider     ← REAL Seam (Native | Mock)
                       └─ NativeAIProvider
                             └─ LLMEngine               ← HYPOTHETICAL Seam
                                   └─ SmallModelProvider only (LiteRT)
                                         └─ ModelManagementService

SmsService (shallow facade)
    ├─ SmsInboxBridge → expo-sms-inbox
    ├─ SmsSyncPipeline → SmsParser / RuleEngine / ledger write
    └─ SmsRuleEngine → RuleMatcher

useWidgetSync → ExpoWidgets.syncWidgetData(WidgetDataSnapshot)
```

---

## Depth / Leverage / Locality scorecard

| Cluster | Depth | Leverage | Locality | Priority smell |
|---|---|---|---|---|
| Transcript Pipeline (`ingest`) | High | High (one call site today, expandable) | High | Mutable PipelineContext width |
| LLMEngine production Adapters | High Interface, 1 Adapter | Low swap Leverage | High in SmallModelProvider | No `LiteRTAdapter`; CONTEXT drift |
| FallbackAI provider | High | High (Native/Mock) | High | Good Seam |
| SmsSyncPipeline | High | High | Medium (god Module) | Split vs typed steps |
| SmsService | Low | Low | Low | Delete/narrow facade |
| Preferences | Low (wide) | Low | Mixed | Split Interfaces by domain |
| ExchangeRate | High | High | High | Untyped HTTP |
| files/compression .native/.web | Good | High | High | Exemplar real Seam |
| journalStatus / TraceService / getNow | Low | Low | n/a | Pass-through candidates |

---

## Answers to the explicit questions

1. **Do Pipeline steps form deep Modules behind a small Pipeline Interface?**  
   **Yes at the orchestrator.** `ingest()` is a small, deep Interface. Individual steps are mixed depth and share a wide Context Seam — deepen the cluster as a whole, not each step’s public surface.

2. **Is there a real second LLMEngine Adapter?**  
   **No in production.** Only `SmallModelProvider`. Test mocks don’t count as a product Adapter. CONTEXT’s `LiteRTAdapter` name is aspirational/outdated. The **real** adjacent Seam is `TransactionFallbackAIProvider` (Native + Mock).