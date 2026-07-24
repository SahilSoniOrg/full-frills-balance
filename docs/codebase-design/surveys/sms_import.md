# Module Design Audit — Depth / Seam / Adapter

Vocabulary per `.agents/skills/codebase-design`. **Depth** = leverage at interface. **Seam real** iff ≥2 justified adapters. **P0–P3** = deepening priority (P0 first).

**Doc note:** `docs/ARCHITECTURE.md` L39 / L188 still say `NotificationService` owns Safe-to-Spend. Owner is `SafeToSpendReadModel` (437 LOC); `NotificationService` re-exports types + delegates `observeSafeToSpend` / `clearCache` / `preWarm`.

---

## SMS

| Module | LOC | Interface (what caller must know) | Depth | Seam | Adapters | Priority |
|--------|-----|-----------------------------------|-------|------|----------|----------|
| **`sms-service` (`SmsService`)** | 268 | ~20 methods + re-exports 15+ types/classes (`RuleMatcher`, `SmsParser`, pipelines…). Callers learn inbox filters, sync cursors, rule CRUD, parse, merge ops. | **Shallow** — deletion test: mostly pass-through; complexity stays in callees | External “SMS façade” for features | Single concrete singleton | **P0** — collapse to thin inbox/query façade *or* stop re-exporting internals; don’t teach callers the whole SMS stack via one barrel |
| **`SmsSyncPipeline`** | 504 | Public: `scanInbox`, `markSmsAsProcessed`, plus leaked helpers (`computeSmsFingerprint`, `resolveProcessingStatus`, `prepareUpsertInboxRecord`, `toDirection`) | **Deep core, leaky surface** — scan hides parse/dedupe/auto-post/write; helpers inflate interface | Hard-wired to DB, bridge, rule engine, journal write | 1 prod path | **P1** — deepen *external* surface to `scanInbox` (+ maybe progress); keep fingerprint/status as internal seams for tests |
| **`SmsRuleEngine`** | 343 | Mix: pure helpers (`isMeaningfulCondition`, `getRuleDefinition`, match) + I/O (`preview`, `getMatchingRule`, suggestions, save/delete, merge) | **Medium** — good locality for rules, but interface spans pure + persistence | No injected ports; repo globals | 1 | **P2** — split pure matching (already partly `RuleMatcher`) from CRUD; don’t expose definition parsers unless UI needs them |
| **`SmsInboxBridge`** | 38 | `getLatestMessages(limit)` — platform + permission + native module | **Deep for size** — hides Android permission dance | Native SMS I/O | 1 (`ExpoSmsInbox`); web throws | **P3** — real only if you add a fake inbox adapter for tests; otherwise leave |
| **`SmsParser`** | 102 | `SmsParser.parse(sms) → ParsedTransaction` (+ `toTransactionDirection`) | **Deep** — confidence/status/ignore rules behind one call | In-process; wraps `SmsExtractor` | 1 extractor instance | **P3** — already good; keep internal |
| **`RuleMatcher`** | 163 | `compileRule` / `compileCondition` → `Predicate`; rich condition/action types | **Deep** — pure compile/match | In-process | N/A (pure) | **P3** — exemplar deep module; tests already at interface |

**SMS cluster verdict:** Real deepening is **facade collapse** (`sms-service`) + **pipeline surface shrink**. Internals (`RuleMatcher`, `SmsParser`) are already deep. `SmsInboxBridge` seam is **hypothetical** until a second adapter exists.

---

## AI / Ingestion

| Module | LOC | Interface | Depth | Seam | Adapters | Priority |
|--------|-----|-----------|-------|------|----------|----------|
| **`ai/types` (`LLMEngine`, `DynamicLLMEngine`)** | 78 | `generate` / optional stream / `dispose`; Dynamic adds `switchModel` | Port only | Intended LLM port | **1 real:** `SmallModelProvider`; tests mock engine | **P2** — seam **mostly hypothetical** in prod (one engine); justified by tests + possible future backends |
| **`SmallModelProvider`** | 257 | Implements `DynamicLLMEngine`; load/backend/OOM/download coupling | **Deep adapter** — LiteRT + catalog + memory | Sits on `LLMEngine` | LiteRT via `createLLM` | **P3** — keep behind port; don’t widen callers past `LLMEngine` |
| **`ModelManagementService`** | 328 | Catalog + download/cancel/delete + custom models + listeners | **Medium-deep** — download complexity hidden; catalog is large data in same module | FS/network via `ModelRegistry` | 1 | **P2** — optional split catalog (data) vs download lifecycle |
| **`TransactionIngestionService`** | 66 | `ingest(transcript, workplaceId, forceAi?)` + `setAiProvider` | **Deep** — best external seam in cluster | Pipeline internal; AI via provider | Steps hardcoded | **P1** — keep as *the* external interface; stop exporting pipeline types as public API |
| **Pipeline (`PipelineStep` + 3 steps)** | ~270 | Mutable `PipelineContext` + `execute(ctx)` | **Shallow individually**; composition is deep | Internal orchestration | 3 steps (Context / Deterministic / AiFallback) | **P2** — treat as **internal** seams; exporting `PipelineStep` from `index.ts` makes them look external |
| **`NativeAIProvider`** | 351 | `TransactionFallbackAIProvider.parse` | **Deep** — multi/single-pass prompts, cancel, JSON parse | Injected `LLMEngine` | Uses `smallModelProvider` | **P3** |
| **`TransactionFallbackAIProvider` (port)** | — | `parse → ParserOutput \| null` | Port | AI fallback | **2 real:** `NativeAIProvider`, `MockTransactionFallbackAIProvider` (+ `setAiProvider`) | **P3** — exemplar real seam |
| **`TransactionService`** | 231 | Enrich/observe journal txs with account info | **Medium** — Rx composition + mapping | Repo globals | 1 | **P1** — **misplaced** under `transaction-ingestion/`; rename/move to journal read path; not ingestion |

**AI cluster verdict:** External deepen around **`ingest()`**. `TransactionFallbackAIProvider` is a **real** seam. `LLMEngine` is **weakly real** (prod×1, test×1). Don’t deepen by adding more pipeline step ports.

---

## Import / Export

| Module | LOC | Interface | Depth | Seam | Adapters | Priority |
|--------|-----|-----------|-------|------|----------|----------|
| **`ImportPlugin` + registry** | types 85 + registry 57 | `detect` / `parse` + registry `detect|get|getAll` | Port deep; registry thin | Format variation | **3 real:** native, ivy, cashew (+ test mocks) | **P3** — best real seam in app; leave |
| **Plugins** | native 413 / ivy 912 / cashew 733 | Same plugin interface; large format-specific impl | **Deep adapters** | At `ImportPlugin` | 3 | **P3** — deepen *inside* plugin if needed, not the port |
| **`ImportService`** | 227 | `executeImport(plugin, context, workplaceId, onProgress)` | **Deep** — parse→wipe→init→insert→rates→integrity | Orchestration | Uses plugin + repos | **P3** — good shape |
| **`ImportBalanceCalculator`** | 92 | `calculateImportRunningBalances(data, onProgress?)` | **Deep** — pure-ish balance walk | In-process | 1 | **P3** |
| **`ImportRepository`** | 860 | `batchInsert` / `applyChanges` + huge `Imported*` / `BatchImportData` DTO surface | **Deep ops, heavy type interface** — caller must know full import schema | Persistence | 1 Watermelon path | **P1** — keep ops; consider shrinking exported DTO surface / co-locate with export types |
| **`export-service`** | 669 | `exportToJSON` / `getExportSummary` + many `*Export` interfaces | **Deep behavior, wide schema** | DB dump | 1 | **P2** — pair with import DTOs (one schema module); don’t split for depth alone |
| **`SharingService`** | 350 | `share|save(provider, format)` + platform delivery | **Deep** — file/web/size tiers behind small methods | Delivery | Platform branches (not separate classes) | **P3** |
| **`ShareProvider` / `TransactionShareProvider`** | port + 228 | `getContent(format)` | Provider deep for formats | Content vs delivery | **1 content adapter** in prod; tests use same | **P2** — seam **semi-real** (designed for more providers; only transactions today). Add second provider before abstracting further |

**Import/export verdict:** `ImportPlugin` is the gold standard. Deepen by **unifying export/import schemas**, not more registries. `ShareProvider` waits for a second content adapter.

---

## Repos / Utils

| Module | LOC | Interface | Depth | Seam | Adapters | Priority |
|--------|-----|-----------|-------|------|----------|----------|
| **`AccountRepository`** | 708 | ~25 observe/find/create/update/delete/merge/raw list methods | **Shallow-wide** — CRUD bag; each method ≈ thin query | Watermelon + raw SQL | 1 | **P0** — deepen by *use-case modules* (hierarchy read, merge, list-with-metrics) rather than one god repo |
| **`TransactionRepository`** | 645 | ~25 find/observe/count/date-range methods | **Shallow-wide** | Watermelon | 1 | **P0** — same; many callers force broad interface |
| **`TransactionRawRepository`** | 426 | Aggregate raw reads + observes | **Medium** — hides SQL; still many entry points | Raw SQL hot path | Delegates to `raw/*` | **P1** — good internal split; external surface still a kitchen sink |
| **`raw/*`** (Metrics 328 / Rebuild 199 / Pattern 106) | — | Query helpers | Implementation slices | Internal to raw repo | N/A | **P3** — keep internal; don’t export as public modules |
| **`preferences.ts`** | 557 | `UIPreferences` (~25 keys) + per-key getters/setters + observe + React hook + legacy | **Shallow** — interface ≈ bag of fields; little behavior per key | MMKV | 1 | **P0** — split domains (theme, notifications, AI, SMS, privacy) behind smaller modules; one bag is the anti-pattern |
| **`navigation.ts` (`AppNavigation`)** | 710 | ~50 `toX` route builders | **Shallow** — path strings with light param encoding | Expo Router | 1 | **P1** — deepen only if you add typed routes / guards; else it’s a justified thin table. Don’t add ports |

---

## Cross-cutting: Safe-to-Spend ownership (stale docs)

| Module | Role | Depth | Seam |
|--------|------|-------|------|
| **`SafeToSpendReadModel`** | Owns `observeSafeToSpend`, cache, projection assembly | **Deep** | Real computation seam |
| **`NotificationService`** | Permissions, schedule reminder, **re-exports** STS types + delegates observe/preWarm | **Shallow façade** for STS | Hypothetical “notification owns STS” — docs lie |
| **Call sites** | Still import `SafeToSpendResult` from `NotificationService` | Coupling to wrong module | **P0 doc + import fix** — point features at `SafeToSpendReadModel`; leave notifications for notifications |

---

## Deepening backlog (ordered)

| Pri | Action | Why |
|-----|--------|-----|
| **P0** | Fix STS ownership in docs + imports | Docs/callers teach wrong module |
| **P0** | Collapse `sms-service` re-export façade | Shallow; leaks entire SMS taxonomy |
| **P0** | Split `preferences` by domain | Classic shallow bag |
| **P0** | Carve use-cases out of `AccountRepository` / `TransactionRepository` | Wide interfaces, thin methods |
| **P1** | Shrink `SmsSyncPipeline` public API to scan (+ tests at that seam) | Deep impl, leaky helpers |
| **P1** | Move `TransactionService` out of `transaction-ingestion` | Naming/locality lie |
| **P1** | Keep `TransactionIngestionService.ingest` as sole external AI ingest interface | Pipeline already deep behind it |
| **P2** | Unify Import/Export DTO schemas; don’t add ShareProvider #2 until needed | Schema duplication vs premature ports |
| **P3** | Leave `ImportPlugin`, `RuleMatcher`, `SmsParser`, `SharingService` delivery | Already deep / real seams |

---

## Seam reality cheat-sheet

| Seam | Reality | Adapters |
|------|---------|----------|
| `ImportPlugin` | **Real** | native, ivy, cashew (+ mocks) |
| `TransactionFallbackAIProvider` | **Real** | Native + Mock (+ injectable) |
| `ShareProvider` | **Semi** | TransactionShare only |
| `LLMEngine` | **Weak** | SmallModelProvider + test mocks |
| `PipelineStep` | **Internal** | 3 hardcoded steps — don’t promote |
| `SmsInboxBridge` | **Hypothetical** | One native path |
| Repo “interfaces” | **None** | Singletons; test via DB stand-in |
| `sms-service` barrel | **Anti-seam** | Re-exports hide real module boundaries |