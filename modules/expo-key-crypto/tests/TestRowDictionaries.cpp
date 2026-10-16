// Host-only trusted provider. Never compiled into Android, iOS or shipped WASM.
#define lookupRowDictionary lookupFinancialDictionary
#include "../cpp/RowDictionaries.cpp"
#undef lookupRowDictionary

namespace ffb::rows {
std::span<const std::uint8_t> lookupRowDictionary(std::string_view recordType, std::string_view id) {
  // Deliberately unrelated opaque names and raw zstd dictionary bytes.
  static constexpr std::uint8_t bytes[] = "PUBLIC SYNTHETIC TEST ONLY weather temperature humidity";
  static const RowDictionaryDescriptor fixture{"weather.observation", "opaque-test-dictionary-7", bytes};
  if (recordType == fixture.recordType && id == fixture.id) return fixture.bytes;
  return lookupFinancialDictionary(recordType, id);
}
}
