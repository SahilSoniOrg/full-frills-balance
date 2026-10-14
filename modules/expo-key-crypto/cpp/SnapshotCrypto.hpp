#pragma once
#include "CryptoPrimitives.hpp"

namespace ffb::detail {
Json encryptSnapshot(const std::string &source, const Bytes &dek,
                     const Json &keys);
std::string decryptSnapshot(const Json &envelope, const Bytes &dek,
                            const std::string &workplace);
} // namespace ffb::detail
