# Phase 3: Production Readiness & Native AI Validation

This document tracks the final production readiness of the on-device AI ingestion pipeline.

## 🚀 Status: Feature-Complete

| Component | Status | Notes |
| :--- | :--- | :--- |
| `SmallModelProvider` | ✅ Implemented | Wrapper for `llama.rn` with timeout & disposal logic. |
| `ModelManagementService` | ✅ Implemented | Handles downloads, status, and cleanup in `documentDirectory`. |
| `NativeAIProvider` | ✅ Implemented | Ingestion fallback using LLM with local JSON cleanup. |
| `AiBenchmarkView` | ✅ Implemented | Lab UI for performance testing & model evaluation. |
| `TransactionIngestionService` | ✅ Implemented | Multi-stage pipeline with 3000ms budget enforcement. |

## 🧪 Model Recommendations (Post-Benchmark)

Based on preliminary architecture and target devices:

1. **Primary**: Qwen 2.5 0.5B (Fastest, ~400MB RAM, Q4_K_M)
2. **Alternative**: Llama 3.2 1B (High accuracy, ~800MB RAM, Q4_K_M)
3. **Power**: Phi 3.5 Mini (Highest reasoning, ~2.3GB RAM - use only on 8GB+ devices)

## 📊 Telemetry Verification

The following events are now instrumented:
- `parse_deterministic_success`: Low-latency parser hits.
- `parse_ai_fallback_triggered`: When fallback is needed.
- `parse_ai_timeout`: Enforced 3000ms budget limit.
- `parse_ai_success`: Successful LLM resolution.

## 🛠 Next Steps (Production Checklist)

1. [ ] **Dependency Rollout**: Ensure `llama.rn` is included in the production build pipeline.
2. [ ] **Pre-warming**: Consider background pre-warm of the model during app startup if "Native AI" is enabled.
3. [ ] **Memory Monitoring**: Add `expo-device` checks to disable larger models on low-RAM devices (< 4GB).
4. [ ] **Structured Output**: Refine GBNF grammar if model JSON parsing becomes unreliable.
