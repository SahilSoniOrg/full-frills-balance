# Domain Glossary

This file captures the domain language for full-frills-balance. Use these terms precisely in code and conversation.

## Accounting & Ledger
- **Account**: A ledger entity with type Asset, Liability, or Equity, representing physical or legal holding of value (e.g., Bank Account, Credit Card, Cash, Loan).
- **Category**: A ledger entity with type Income or Expense, representing the classification of money flow (e.g., Salary, Food, Rent).

## Multi-tenancy
- **Workplace**: The tenant boundary for the app. Nearly every persisted table and query is scoped by `workplaceId`. A user can have multiple workplaces (e.g. personal vs. side business); the active one is stored in preferences as `activeWorkplaceId` and surfaced via `WorkplaceContext`.

## AI & Inference
- **LLMEngine**: The interface representing a running instance of a local LLM that can generate completions. Hides the complexity of loading, managing, and unloading model weights.
- **Inference Adapter**: The concrete implementation of `LLMEngine` (e.g. `SmallModelProvider`) that handles cross-seam dependencies like `ModelManagementService`.

## Ingestion
- **Pipeline**: The sequence of independent steps that process a transaction transcript.
- **PipelineStep**: An interface for a single unit of work in the pipeline (e.g., `ContextGatheringStep`, `DeterministicStep`, `AiFallbackStep`). Steps can choose to halt the pipeline early.
- **PipelineContext**: The state passed between steps, containing the transcript, fetched accounts, and current parsing confidence.

## Dashboard & Safe to Spend
- **Safe to Spend**: The spendable amount after liquid assets, expected inflows, committed spending, and near-term debt obligations over the projection window are accounted for—not the raw bank balance.
- **Safe to Spend explanation**: Help whose job is to teach how Safe to Spend is defined and calculated (the formula and rules), not to be the primary place to audit today's line items.
- **Breakdown slice**: One visual segment of the Safe to Spend breakdown—spendable headroom, committed spending, or outstanding debt—each tappable for detail.
- **Breakdown detail**: The audit-oriented view of what makes up a single breakdown slice at the current workplace (grouped obligations, amounts, timing).
- **Breakdown-to-explanation link**: A deliberate bridge from breakdown detail to Safe to Spend explanation when the user wants the full calculation rules—not a second copy of the formula inside breakdown detail.
- **Safe slice breakdown detail**: Audit-focused detail for the spendable headroom segment; it does not repeat the full Safe to Spend formula (that lives in Safe to Spend explanation only).
- **Reserved / outstanding breakdown detail**: Audit-only views for their slices; they do not link to Safe to Spend explanation.

## Application architecture (entropy remediation)

- **Command**: The only supported way for application code to change persisted domain state for an aggregate (e.g. create planned payment, merge accounts). Owns validation, persistence, and required side effects (journals, rebuild, audit).
_Avoid_: Façade, service method that mixes unrelated lifecycles

- **Intent module**: A narrow persistence or read API grouped by caller purpose (e.g. journal write, journal timeline, SMS journal lookup), not by database table alone.
_Avoid_: Repository, god-repository

- **System account**: A workplace-scoped ledger account created by the product for mechanics (opening balances, balance correction), not chosen by the user in the account picker.
_Avoid_: Default account, meta account

- **Account read module**: Curated reactive observe/find API (`accountQueries`) exposing only methods required by feature hooks today; add new methods only when a hook needs them.
_Avoid_: AccountService, second repository façade

- **Canonical import**: The versioned, validated shape (`canonical-import.v1`) that every import plugin must produce before persistence; the only type the import write path should accept after validation.
_Avoid_: Raw plugin JSON, `BatchImportData` in persistence without conversion

- **Audit revert**: Restoring persisted state from a recorded `before` snapshot when undoing an audited change. Uses dedicated commands when semantics differ from a normal user edit (e.g. `revertAccountFromAuditState`, not hierarchy `updateAccount`).
_Avoid_: Treating undo as “call the same update API with old fields”
