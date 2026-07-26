# Import persistence adapter for Watermelon `_raw` writes

Batch import persists validated `CanonicalImport` data through `ImportRepository`, but Watermelon sometimes requires setting `_raw` columns (timestamps, FK ids) that the model `create` API does not expose. Those escapes are confined to a single persistence adapter module with a documented narrow type (e.g. `WatermelonImportRecord`). `ImportService` and `ImportRepository` orchestration code stay free of `any`; plugin format quirks stay at the plugin seam.

_Avoid_: Scattering `(record as any)._raw` across the repository file; accepting unvalidated batch shapes in the write path.
