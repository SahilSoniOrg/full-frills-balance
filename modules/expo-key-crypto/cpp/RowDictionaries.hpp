#pragma once
#include <cstdint>
#include <span>
#include <string_view>

namespace ffb::rows {
// Empty for unknown immutable IDs; callers must reject rather than guess.
std::span<const std::uint8_t> lookupRowDictionary(std::string_view id);
}
