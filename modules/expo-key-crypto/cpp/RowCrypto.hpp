#pragma once
#include "KeyCrypto.hpp"

namespace ffb::rows {
Json encryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault);
Json decryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault);
// Shared bounded decoder. Recovery callers supply a transient native DEK only.
Json decryptRowsWithDek(const Json &request, const Json &keys, const Bytes &dek);
Json signRowManifest(const Json &request, const Json &user, Vault &vault);
} // namespace ffb::rows
