# FUL-43: Local AI removal

On-device LiteRT inference was unused. It is removed from the app and native
build.

Voice/SMS ingestion still runs the deterministic parser, then the existing
mock AI fallback (tests can inject a provider). There is no local model
runtime and no Hugging Face download path.

Removed: `react-native-litert-lm`, LiteRT Expo/Android plugins, model
management, Native AI provider, AI Dev Lab, and native-AI preferences.

Upgrades still delete leftover on-device weights (no LiteRT dependency):
- iOS: `Library/Caches/litert_models/` and loose `*.litertlm` under cache
- Android: `files/models/*.litertlm` (and `.tmp` downloads); the `models`
  directory is removed only if it is empty afterward

Stale preference keys (`isNativeAiEnabled`, `preferredAiModelId`,
`aiInferenceMode`) are stripped from MMKV on load.
