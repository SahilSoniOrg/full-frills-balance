#pragma once
#include <cstdint>
#include <span>
#include <string_view>

namespace ffb::rows {
// Build-time trusted profile assets. Archives/callers cannot register replacements.
struct RowDictionaryDescriptor {
  std::string_view recordType;
  std::string_view id;
  std::span<const std::uint8_t> bytes;
};
// Exact immutable ID AND type match; empty means reject, never fall back.
std::span<const std::uint8_t> lookupRowDictionary(std::string_view recordType,
                                               std::string_view id);
}
