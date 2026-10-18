#pragma once
#include "KeyCrypto.hpp"
#include <string>

namespace ffb::rows {
inline constexpr const char *ROW_COMPRESSION = "gzip";
inline constexpr std::size_t MAX_ROW_PLAINTEXT = 64 * 1024;

void requireRowCompression(const std::string &compression);
Bytes compressRow(const std::string &plaintext, const std::string &compression);
Bytes decompressRow(const Bytes &body, const std::string &compression);
} // namespace ffb::rows
