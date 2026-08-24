# Blockers and prohibited claims

## Current blockers

- No physical-device run has been established. Claims about real-device startup magnitude, UI/main-thread hitches, native memory, thermal behavior, and OEM-specific behavior are prohibited.
- No release-like mobile runtime measurement has been established. Development/profiler results must not be generalized to user-visible release performance.
- Representative and large synthetic datasets are not yet calibrated from product telemetry or documented limits. Scaling claims remain static/inconclusive until seeds and shapes are recorded.
- The iOS release simulator build was started from the current checkout, but it was still compiling at audit handoff; no completed app workload run or trace was recorded.
- Android has no connected device/emulator in this environment.

## Required evidence

- A reproducible release-like Android/iOS build or local equivalent.
- Named device class/model, OS, RAM, refresh rate, power/network state, and repeated raw runs.
- Deterministic privacy-safe seed profiles for empty, typical, large, and stress workloads.
- React/JS traces plus native frame/memory traces for the affected layer.

## Claims prohibited by these blockers

- No measured P0/P1 user-impact claim, input latency, jank/FPS, memory-leak, battery, thermal, or field-prevalence claim.
- Simulator build/source evidence does not substitute for physical-device native memory, GPU/frame, thermal, or OEM evidence.
- Existing “TTI” analytics is splash-hide elapsed time, not a verified first-input-to-visible-result metric.
