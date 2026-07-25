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
