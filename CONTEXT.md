# Domain Glossary

This file captures the domain language for full-frills-balance. Use these terms precisely in code and conversation.

## Accounting & Ledger
- **Account**: A ledger entity with type Asset, Liability, or Equity, representing physical or legal holding of value (e.g., Bank Account, Credit Card, Cash, Loan).
- **Category**: A ledger entity with type Income or Expense, representing the classification of money flow (e.g., Salary, Food, Rent).

## AI & Inference
- **LLMEngine**: The interface representing a running instance of a local LLM that can generate completions. Hides the complexity of loading, managing, and unloading model weights.
- **Inference Adapter**: The concrete implementation of `LLMEngine` (e.g. `SmallModelProvider`) that handles cross-seam dependencies like `ModelManagementService`.

## Ingestion
- **Pipeline**: The sequence of independent steps that process a transaction transcript.
- **PipelineStep**: An interface for a single unit of work in the pipeline (e.g., `ContextGatheringStep`, `DeterministicStep`, `AiFallbackStep`). Steps can choose to halt the pipeline early.
- **PipelineContext**: The state passed between steps, containing the transcript, fetched accounts, and current parsing confidence.
