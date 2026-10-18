#include "CryptoPrimitives.hpp"
#include <algorithm>
#include <cctype>
#include <openssl/rand.h>
#include <openssl/x509.h>

namespace ffb {
const char *safeErrorCode(std::exception_ptr error) noexcept {
  try {
    if (error)
      std::rethrow_exception(error);
  } catch (const OperationError &failure) {
    switch (failure.code) {
    case ErrorCode::Locked:
      return "FFB_KEY_LOCKED";
    case ErrorCode::VaultUnavailable:
      return "FFB_KEY_VAULT_UNAVAILABLE";
    case ErrorCode::RecoveryRequired:
      return "FFB_KEY_RECOVERY_REQUIRED";
    case ErrorCode::InvalidFile:
      return "FFB_KEY_INVALID_FILE";
    case ErrorCode::AuthenticationFailed:
      return "FFB_KEY_AUTHENTICATION_FAILED";
    case ErrorCode::ReferenceExpired:
      return "FFB_KEY_REFERENCE_EXPIRED";
    case ErrorCode::Cancelled:
      return "FFB_KEY_CANCELLED";
    case ErrorCode::RowUnsupportedCompression:
      return "FFB_ROW_UNSUPPORTED_COMPRESSION";
    case ErrorCode::RowTooLarge:
      return "FFB_ROW_TOO_LARGE";
    case ErrorCode::RowIntegrity:
      return "FFB_ROW_INTEGRITY";
    case ErrorCode::OperationFailed:
      return "FFB_KEY_OPERATION_FAILED";
    }
  } catch (const Json::exception &) {
    return "FFB_KEY_INVALID_FILE";
  } catch (...) {
  }
  return "FFB_KEY_OPERATION_FAILED";
}
void wipe(Bytes &value) {
  if (!value.empty())
    OPENSSL_cleanse(value.data(), value.size());
}
} // namespace ffb
namespace ffb::detail {
void require(bool value, const char *message, ErrorCode code) {
  if (!value)
    throw OperationError(code, message);
}
void wipeJson(Json &value) {
  if (value.is_string()) {
    auto &text = value.get_ref<std::string &>();
    if (!text.empty())
      OPENSSL_cleanse(text.data(), text.size());
  } else if (value.is_structured())
    for (auto &item : value)
      wipeJson(item);
}
Bytes secretDump(const Json &value) {
  auto serialized = value.dump();
  Bytes result(serialized.begin(), serialized.end());
  if (!serialized.empty())
    OPENSSL_cleanse(serialized.data(), serialized.size());
  return result;
}
const std::string &secretField(const Json &value, const char *name) {
  require(value.contains(name) && value[name].is_string(),
          "Invalid native secret field");
  return value[name].get_ref<const std::string &>();
}
Bytes bytes(const std::string &value) {
  return Bytes(value.begin(), value.end());
}
std::string text(const Bytes &value) {
  return std::string(value.begin(), value.end());
}
const std::string &field(const Json &value, const char *name) {
  require(value.contains(name) && value[name].is_string(),
          "Invalid native key request");
  return value[name].get_ref<const std::string &>();
}
void fields(const Json &value, std::initializer_list<const char *> allowed) {
  require(value.is_object(), "Invalid native key object");
  for (auto it = value.begin(); it != value.end(); ++it)
    require(std::find(allowed.begin(), allowed.end(), it.key()) !=
                allowed.end(),
            "Unexpected native key field");
}
bool sameReference(const Json &left, const Json &right) {
  if (!left.is_object() || !right.is_object() || left.size() != right.size())
    return false;
  for (auto it = left.begin(); it != left.end(); ++it)
    if (!right.contains(it.key()) || right.at(it.key()) != it.value())
      return false;
  return true;
}
Bytes random(size_t count) {
  Bytes value(count);
  require(RAND_bytes(value.data(), static_cast<int>(count)) == 1,
          "Secure randomness is unavailable", ErrorCode::OperationFailed);
  return value;
}
std::string hex(const Bytes &value) {
  static constexpr char digits[] = "0123456789abcdef";
  std::string result(value.size() * 2, '0');
  for (size_t i = 0; i < value.size(); ++i) {
    result[i * 2] = digits[value[i] >> 4];
    result[i * 2 + 1] = digits[value[i] & 15];
  }
  return result;
}
Bytes unhex(std::string_view input, size_t count) {
  require(input.size() == count * 2, "Invalid native key encoding");
  auto digit = [](unsigned char c) -> int {
    if (c >= '0' && c <= '9')
      return c - '0';
    if (c >= 'a' && c <= 'f')
      return c - 'a' + 10;
    throw OperationError(ErrorCode::InvalidFile, "Invalid native key encoding");
  };
  Bytes result(count);
  for (size_t i = 0; i < count; ++i)
    result[i] = static_cast<unsigned char>((digit(input[2 * i]) << 4) |
                                           digit(input[2 * i + 1]));
  return result;
}
std::string fingerprint(const Bytes &value) {
  Bytes digest(32);
  unsigned int size = 0;
  require(EVP_Digest(value.data(), value.size(), digest.data(), &size,
                     EVP_sha256(), nullptr) == 1 &&
              size == 32,
          "Native digest failed", ErrorCode::OperationFailed);
  return "sha256:" + hex(digest);
}
std::string b64(const Bytes &value) {
  std::string result(4 * ((value.size() + 2) / 3), '\0');
  int count = EVP_EncodeBlock(reinterpret_cast<unsigned char *>(result.data()),
                              value.data(), static_cast<int>(value.size()));
  require(count >= 0, "Native encoding failed", ErrorCode::OperationFailed);
  result.resize(count);
  return result;
}
Bytes unb64(const std::string &input, size_t limit) {
  require(input.size() <= 4 * ((limit + 2) / 3) && input.size() % 4 == 0,
          "Oversized native ciphertext");
  require(std::all_of(input.begin(), input.end(),
                      [](unsigned char c) {
                        return std::isalnum(c) || c == '+' || c == '/' ||
                               c == '=';
                      }),
          "Invalid native ciphertext encoding");
  Bytes result(input.size() / 4 * 3);
  int length = EVP_DecodeBlock(
      result.data(), reinterpret_cast<const unsigned char *>(input.data()),
      static_cast<int>(input.size()));
  require(length >= 0, "Invalid native ciphertext encoding");
  if (!input.empty() && input.back() == '=')
    --length;
  if (input.size() > 1 && input[input.size() - 2] == '=')
    --length;
  require(length >= 0 && static_cast<size_t>(length) <= limit,
          "Oversized native ciphertext");
  result.resize(length);
  require(b64(result) == input, "Invalid native ciphertext encoding");
  return result;
}
Key rawKey(const Bytes &privateKey, const char *algorithm) {
  Key key(EVP_PKEY_new_raw_private_key_ex(nullptr, algorithm, nullptr,
                                          privateKey.data(), privateKey.size()),
          EVP_PKEY_free);
  require(!!key, "Invalid native private key");
  return key;
}
Bytes publicBytes(EVP_PKEY *key) {
  Bytes result(32);
  size_t size = result.size();
  require(EVP_PKEY_get_raw_public_key(key, result.data(), &size) == 1 &&
              size == 32,
          "Native public key failed", ErrorCode::OperationFailed);
  return result;
}
Key encryptionPair(const Bytes *seed) {
  Bytes pub(32);
  size_t size = pub.size();
  EVP_PKEY *raw = nullptr;
  require(OSSL_HPKE_keygen(HPKE_SUITE, pub.data(), &size, &raw,
                           seed ? seed->data() : nullptr,
                           seed ? seed->size() : 0, nullptr, nullptr) == 1,
          "Native HPKE key generation failed", ErrorCode::OperationFailed);
  return Key(raw, EVP_PKEY_free);
}
Bytes privateBytes(EVP_PKEY *key) {
  Bytes result(32);
  size_t size = result.size();
  require(EVP_PKEY_get_raw_private_key(key, result.data(), &size) == 1 &&
              size == 32,
          "Native private key unavailable", ErrorCode::OperationFailed);
  return result;
}
Key signingPair() {
  Key result(EVP_PKEY_Q_keygen(nullptr, nullptr, "ED25519"), EVP_PKEY_free);
  require(!!result, "Native signing key generation failed",
          ErrorCode::OperationFailed);
  return result;
}
Bytes pkcs8(EVP_PKEY *key) {
  std::unique_ptr<PKCS8_PRIV_KEY_INFO, decltype(&PKCS8_PRIV_KEY_INFO_free)>
      info(EVP_PKEY2PKCS8(key), PKCS8_PRIV_KEY_INFO_free);
  require(!!info, "Native signing encoding failed", ErrorCode::OperationFailed);
  int length = i2d_PKCS8_PRIV_KEY_INFO(info.get(), nullptr);
  require(length > 0 && length <= 128, "Native signing encoding failed",
          ErrorCode::OperationFailed);
  Bytes result(length);
  auto *p = result.data();
  require(i2d_PKCS8_PRIV_KEY_INFO(info.get(), &p) == length,
          "Native signing encoding failed", ErrorCode::OperationFailed);
  return result;
}
Key signingKey(const Bytes &encoded) {
  const auto *p = encoded.data();
  std::unique_ptr<PKCS8_PRIV_KEY_INFO, decltype(&PKCS8_PRIV_KEY_INFO_free)>
      info(d2i_PKCS8_PRIV_KEY_INFO(nullptr, &p, encoded.size()),
           PKCS8_PRIV_KEY_INFO_free);
  require(!!info && p == encoded.data() + encoded.size(),
          "Invalid User signing key");
  Key result(EVP_PKCS82PKEY(info.get()), EVP_PKEY_free);
  require(!!result && EVP_PKEY_is_a(result.get(), "ED25519") == 1,
          "Invalid User signing key");
  return result;
}
Bytes aes(const Bytes &key, const Bytes &nonce, const Bytes &aad,
          std::span<const unsigned char> input, bool encrypt) {
  require(key.size() == 32 && nonce.size() == 12 &&
              input.size() <= MAX_KEY_ENVELOPE_BYTES + 16,
          "Invalid native key-envelope cryptography");
  Cipher c(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
  require(!!c, "Native cipher allocation failed", ErrorCode::OperationFailed);
  Bytes output(input.size() + 16);
  int first = 0, last = 0, ignored = 0;
  if (encrypt) {
    require(EVP_EncryptInit_ex(c.get(), EVP_aes_256_gcm(), nullptr, key.data(),
                               nonce.data()) == 1 &&
                EVP_EncryptUpdate(c.get(), nullptr, &ignored, aad.data(),
                                  aad.size()) == 1 &&
                EVP_EncryptUpdate(c.get(), output.data(), &first, input.data(),
                                  input.size()) == 1 &&
                EVP_EncryptFinal_ex(c.get(), output.data() + first, &last) == 1,
            "Native encryption failed", ErrorCode::OperationFailed);
    output.resize(first + last + 16);
    require(EVP_CIPHER_CTX_ctrl(c.get(), EVP_CTRL_GCM_GET_TAG, 16,
                                output.data() + first + last) == 1,
            "Native encryption tag failed", ErrorCode::OperationFailed);
  } else {
    require(input.size() >= 16, "Invalid encrypted key envelope");
    require(EVP_DecryptInit_ex(c.get(), EVP_aes_256_gcm(), nullptr, key.data(),
                               nonce.data()) == 1 &&
                EVP_DecryptUpdate(c.get(), nullptr, &ignored, aad.data(),
                                  aad.size()) == 1 &&
                EVP_DecryptUpdate(c.get(), output.data(), &first, input.data(),
                                  input.size() - 16) == 1 &&
                EVP_CIPHER_CTX_ctrl(c.get(), EVP_CTRL_GCM_SET_TAG, 16,
                                    const_cast<unsigned char *>(
                                        input.data() + input.size() - 16)) == 1,
            "Native decryption failed", ErrorCode::OperationFailed);
    if (EVP_DecryptFinal_ex(c.get(), output.data() + first, &last) != 1) {
      wipe(output);
      throw OperationError(ErrorCode::AuthenticationFailed,
                           "Native key-envelope authentication failed");
    }
    output.resize(first + last);
  }
  return output;
}
} // namespace ffb::detail
#ifdef FFB_KEY_CRYPTO_TEST
namespace ffb {
using namespace detail;
Json testAes(const Json &request) {
  Secret key(unhex(field(request, "key"), 32));
  auto input = field(request, "plaintext");
  Secret plaintext(unhex(input, input.size() / 2));
  return hex(aes(key.bytes, unhex(field(request, "nonce"), 12), {},
                 plaintext.bytes, true));
}
} // namespace ffb
#endif
