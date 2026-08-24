# Full Frills Balance performance audit

This directory is the durable audit state for the repository at commit `6fb79796782c473f664a2a90ac0ca827c79a9908` (2026-08-25). It records static coverage, workloads, hypotheses, evidence limits, rejected investigations, and final findings. It must not contain private financial, SMS, account, or model-prompt data.

Status is maintained in `coverage.md`; the report is `report.md`. The audit is evidence-first: static signals remain hypotheses until the acceptance gate in the React Native performance-audit methodology is met.

Files:

- `environment.md` — reproducibility and build/runtime ground truth.
- `file-inventory.csv` — relevant source/configuration coverage.
- `workloads.csv` — user/system workload inventory and disposition.
- `surface-matrix.csv` — mandatory surface coverage.
- `hypotheses.csv` — evidence ledger.
- `run-log.csv` — measurements and command results.
- `findings.md` — accepted findings, if any.
- `rejected-hypotheses.md` — investigated signals not promoted to findings.
- `blockers.md` — exact limits and prohibited claims.
- `coverage.md` — coverage/depth/validation status.
- `decision-log.md` — profile drift and audit decisions.
- `report.md` — durable handoff report.

