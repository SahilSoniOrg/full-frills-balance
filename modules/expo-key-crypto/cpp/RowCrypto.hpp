#pragma once
#include "KeyCrypto.hpp"

namespace ffb::rows {
Json encryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault);
Json decryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault);
Json signRowManifest(const Json &request, const Json &user, Vault &vault);
} // namespace ffb::rows
