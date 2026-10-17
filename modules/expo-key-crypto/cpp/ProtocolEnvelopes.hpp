#pragma once
#include "CryptoPrimitives.hpp"

namespace ffb::detail {
struct UserSecret {
  Key encryption;
  Key signing;
};
Json context(const char *purpose, const Json &user,
             const std::string &recipient, const std::string &keyId,
             const std::string &workplace = "", const std::string &device = "");
Json seal(const Bytes &plaintext, const std::string &recipient,
          const Json &context);
std::string identityFingerprint(const Json &identity);
void checkPublicUser(const Json &user);
UserSecret decodeBundle(const Bytes &bundle, const Json &user);
std::string vaultName(const Json &user);
Bytes userBundle(const Json &user, Vault &vault);
UserSecret userSecret(const Json &user, Vault &vault);
Json recovery(const char *purpose, const std::string &identityId,
              const std::string &keyId, EVP_PKEY **recipient);
Key recoveryKey(const Json &credential);
Bytes recoveryOpen(const Json &credential, const Json &envelope,
                   const Json &context, const std::string &id,
                   const std::string &keyId);
Json recoveryContext(const Json &user);
Json memberContext(const Json &user, const Json &keys);
Json dumpContext(const Json &keys);
Bytes memberKey(const Json &user, const Json &keys, Vault &vault);
} // namespace ffb::detail
