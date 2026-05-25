# Domain Glossary

This file captures the domain language for full-frills-balance. Use these terms precisely in code and conversation.

## AI & Inference
- **LLMEngine**: The interface representing a running instance of a local LLM that can generate completions. Hides the complexity of loading, managing, and unloading model weights.
- **Inference Adapter**: The concrete implementation of `LLMEngine` (e.g. `LiteRTAdapter`) that handles cross-seam dependencies like `ModelManagementService`.
