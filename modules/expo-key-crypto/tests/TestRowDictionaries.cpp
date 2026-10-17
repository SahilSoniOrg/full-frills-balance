// Host-only trusted provider. Never compiled into Android, iOS or shipped WASM.
#define lookupRowDictionary lookupFinancialDictionary
#include "../cpp/RowDictionaries.cpp"
#undef lookupRowDictionary
#include <array>
#include <string>

namespace ffb::rows {
std::span<const std::uint8_t> lookupRowDictionary(std::string_view recordType, std::string_view id) {
  // Deliberately unrelated opaque names and raw zstd dictionary bytes.
  static constexpr std::uint8_t bytes[] = "PUBLIC SYNTHETIC TEST ONLY weather temperature humidity";
  static const RowDictionaryDescriptor fixture{"weather.observation", "opaque-test-dictionary-7", bytes};
  if (recordType == fixture.recordType && id == fixture.id) return fixture.bytes;
  // Boundary types have the same trusted test bytes and unrelated immutable ID.
  // These bindings exist only in the host test binary.
  static const std::array<std::string, 8> boundaryTypes = [] {
    const auto repeat = [](const std::string &unit, unsigned count) {
      std::string text;
      while (count--) text += unit;
      return text;
    };
    return std::array<std::string, 8>{std::string(64, 'x'), std::string(65, 'x'),
      std::string(127, 'x'), std::string(128, 'x'), repeat("é", 32) + "a",
      repeat("é", 63) + "a", repeat("é", 64), repeat("😀", 32)};
  }();
  if (id == fixture.id)
    for (const auto &type : boundaryTypes)
      if (recordType == type) return fixture.bytes;
  return lookupFinancialDictionary(recordType, id);
}
}
