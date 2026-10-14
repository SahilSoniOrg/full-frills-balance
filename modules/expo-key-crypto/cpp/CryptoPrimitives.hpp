#pragma once
#include "KeyCrypto.hpp"
#include <memory>
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hpke.h>
#include <span>
#include <string_view>

// Implementation-only types. No secret-bearing helper is exposed to the bridge.
namespace ffb::detail {
inline constexpr size_t MAX_SNAPSHOT = 32 * 1024 * 1024;
inline constexpr const char *SUITE = "HPKE-X25519-HKDF-SHA256-AES256GCM";
inline const OSSL_HPKE_SUITE HPKE_SUITE = {OSSL_HPKE_KEM_ID_X25519,
                                           OSSL_HPKE_KDF_ID_HKDF_SHA256,
                                           OSSL_HPKE_AEAD_ID_AES_GCM_256};
void require(bool value, const char *message,
             ErrorCode code = ErrorCode::InvalidFile);
void wipeJson(Json &value);
struct Secret {
  Bytes bytes;
  explicit Secret(Bytes value = {}) : bytes(std::move(value)) {}
  Secret(Secret &&) = default;
  Secret(const Secret &) = delete;
  ~Secret() { wipe(bytes); }
};
struct PrivateJson {
  Json value;
  explicit PrivateJson(Json input) : value(std::move(input)) {}
  ~PrivateJson() { wipeJson(value); }
};
struct SecretString {
  std::string value;
  ~SecretString() {
    if (!value.empty())
      OPENSSL_cleanse(value.data(), value.size());
  }
};
using Key = std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)>;
using Hpke = std::unique_ptr<OSSL_HPKE_CTX, decltype(&OSSL_HPKE_CTX_free)>;
using Cipher = std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)>;
using Digest = std::unique_ptr<EVP_MD_CTX, decltype(&EVP_MD_CTX_free)>;
Bytes secretDump(const Json &value);
const std::string &secretField(const Json &value, const char *name);
const std::string &field(const Json &value, const char *name);
void fields(const Json &value, std::initializer_list<const char *> allowed);
bool sameReference(const Json &left, const Json &right);
Bytes bytes(const std::string &value);
std::string text(const Bytes &value);
Bytes random(size_t count);
std::string hex(const Bytes &value);
Bytes unhex(std::string_view input, size_t count);
std::string fingerprint(const Bytes &value);
std::string b64(const Bytes &value);
Bytes unb64(const std::string &input, size_t limit);
Key rawKey(const Bytes &privateKey, const char *algorithm = "X25519");
Bytes publicBytes(EVP_PKEY *key);
Bytes privateBytes(EVP_PKEY *key);
Key encryptionPair(const Bytes *seed = nullptr);
Key signingPair();
Bytes pkcs8(EVP_PKEY *key);
Key signingKey(const Bytes &encoded);
Bytes aes(const Bytes &key, const Bytes &nonce, const Bytes &aad,
          std::span<const unsigned char> input, bool encrypt);
} // namespace ffb::detail
