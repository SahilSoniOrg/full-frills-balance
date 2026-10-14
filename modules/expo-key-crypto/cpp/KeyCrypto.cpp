#include "KeyCrypto.hpp"
#include <algorithm>
#include <cctype>
#include <memory>
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hpke.h>
#include <openssl/rand.h>
#include <openssl/x509.h>
#include <stdexcept>
#include <string_view>

namespace ffb {
namespace {
constexpr size_t MAX_SNAPSHOT = 32 * 1024 * 1024;
constexpr const char *SUITE = "HPKE-X25519-HKDF-SHA256-AES256GCM";
const OSSL_HPKE_SUITE HPKE_SUITE = {OSSL_HPKE_KEM_ID_X25519,
                                    OSSL_HPKE_KDF_ID_HKDF_SHA256,
                                    OSSL_HPKE_AEAD_ID_AES_GCM_256};
void require(bool value, const char *message) {
  if (!value)
    throw std::runtime_error(message);
}
struct Secret {
  Bytes bytes;
  explicit Secret(Bytes value = {}) : bytes(std::move(value)) {}
  Secret(Secret &&) = default;
  Secret(const Secret &) = delete;
  ~Secret() { wipe(bytes); }
};
void wipeJson(Json &value) {
  if (value.is_string()) {
    auto &text = value.get_ref<std::string &>();
    if (!text.empty())
      OPENSSL_cleanse(text.data(), text.size());
  } else if (value.is_structured())
    for (auto &item : value)
      wipeJson(item);
}
struct PrivateJson {
  Json value;
  explicit PrivateJson(Json input) : value(std::move(input)) {}
  ~PrivateJson() { wipeJson(value); }
};
Bytes secretDump(const Json &value) {
  auto serialized = value.dump();
  Bytes result(serialized.begin(), serialized.end());
  if (!serialized.empty())
    OPENSSL_cleanse(serialized.data(), serialized.size());
  return result;
}
struct SecretString {
  std::string value;
  ~SecretString() {
    if (!value.empty())
      OPENSSL_cleanse(value.data(), value.size());
  }
};
const std::string &secretField(const Json &value, const char *name) {
  require(value.contains(name) && value[name].is_string(),
          "Invalid native secret field");
  return value[name].get_ref<const std::string &>();
}
using Key = std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)>;
using Hpke = std::unique_ptr<OSSL_HPKE_CTX, decltype(&OSSL_HPKE_CTX_free)>;
using Cipher = std::unique_ptr<EVP_CIPHER_CTX, decltype(&EVP_CIPHER_CTX_free)>;
using Digest = std::unique_ptr<EVP_MD_CTX, decltype(&EVP_MD_CTX_free)>;
Bytes bytes(const std::string &value) {
  return Bytes(value.begin(), value.end());
}
std::string text(const Bytes &value) {
  return std::string(value.begin(), value.end());
}
std::string field(const Json &value, const char *name) {
  require(value.contains(name) && value[name].is_string(),
          "Invalid native key request");
  return value[name].get<std::string>();
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
          "Secure randomness is unavailable");
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
    if (c >= 'A' && c <= 'F')
      return c - 'A' + 10;
    throw std::runtime_error("Invalid native key encoding");
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
          "Native digest failed");
  return "sha256:" + hex(digest);
}
std::string b64(const Bytes &value) {
  std::string result(4 * ((value.size() + 2) / 3), '\0');
  int count = EVP_EncodeBlock(reinterpret_cast<unsigned char *>(result.data()),
                              value.data(), static_cast<int>(value.size()));
  require(count >= 0, "Native encoding failed");
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
Key rawKey(const Bytes &privateKey, const char *algorithm = "X25519") {
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
          "Native public key failed");
  return result;
}
Key encryptionPair(const Bytes *seed = nullptr) {
  Bytes pub(32);
  size_t size = pub.size();
  EVP_PKEY *raw = nullptr;
  require(OSSL_HPKE_keygen(HPKE_SUITE, pub.data(), &size, &raw,
                           seed ? seed->data() : nullptr,
                           seed ? seed->size() : 0, nullptr, nullptr) == 1,
          "Native HPKE key generation failed");
  return Key(raw, EVP_PKEY_free);
}
Bytes privateBytes(EVP_PKEY *key) {
  Bytes result(32);
  size_t size = result.size();
  require(EVP_PKEY_get_raw_private_key(key, result.data(), &size) == 1 &&
              size == 32,
          "Native private key unavailable");
  return result;
}
Key signingPair() {
  Key result(EVP_PKEY_Q_keygen(nullptr, nullptr, "ED25519"), EVP_PKEY_free);
  require(!!result, "Native signing key generation failed");
  return result;
}
Bytes pkcs8(EVP_PKEY *key) {
  std::unique_ptr<PKCS8_PRIV_KEY_INFO, decltype(&PKCS8_PRIV_KEY_INFO_free)>
      info(EVP_PKEY2PKCS8(key), PKCS8_PRIV_KEY_INFO_free);
  require(!!info, "Native signing encoding failed");
  int length = i2d_PKCS8_PRIV_KEY_INFO(info.get(), nullptr);
  require(length > 0 && length <= 128, "Native signing encoding failed");
  Bytes result(length);
  auto *p = result.data();
  require(i2d_PKCS8_PRIV_KEY_INFO(info.get(), &p) == length,
          "Native signing encoding failed");
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
Bytes binding(const Json &context) {
  return bytes(
      Json::array({"full-frills-key-envelope", 1, SUITE, context.at("purpose"),
                   context.at("userId"), context.at("recipientKeyId"),
                   context.value("deviceId", Json(nullptr)),
                   context.value("workplaceId", Json(nullptr)),
                   context.value("keyId", Json(nullptr))})
          .dump());
}
Json context(const char *purpose, const Json &user,
             const std::string &recipient, const std::string &keyId,
             const std::string &workplace = "",
             const std::string &device = "") {
  Json c = {{"purpose", purpose},
            {"userId", user.at("userId")},
            {"recipientKeyId", recipient}};
  if (!device.empty())
    c["deviceId"] = device;
  if (!workplace.empty())
    c["workplaceId"] = workplace;
  if (!keyId.empty())
    c["keyId"] = keyId;
  return c;
}
Json seal(const Bytes &plaintext, const std::string &recipient, const Json &c) {
  Bytes pub = unhex(recipient, 32), info = binding(c), enc(32),
        ciphertext(plaintext.size() + 16);
  require(plaintext.size() <= 4096 &&
              fingerprint(pub) == field(c, "recipientKeyId"),
          "Invalid envelope recipient or payload");
  Hpke hpke(OSSL_HPKE_CTX_new(OSSL_HPKE_MODE_BASE, HPKE_SUITE,
                              OSSL_HPKE_ROLE_SENDER, nullptr, nullptr),
            OSSL_HPKE_CTX_free);
  size_t elen = enc.size(), clen = ciphertext.size();
  require(!!hpke &&
              OSSL_HPKE_encap(hpke.get(), enc.data(), &elen, pub.data(),
                              pub.size(), info.data(), info.size()) == 1 &&
              OSSL_HPKE_seal(hpke.get(), ciphertext.data(), &clen, info.data(),
                             info.size(), plaintext.data(),
                             plaintext.size()) == 1,
          "Native envelope encryption failed");
  enc.resize(elen);
  ciphertext.resize(clen);
  return {{"format", "full-frills-key-envelope"},
          {"formatVersion", 1},
          {"suite", SUITE},
          {"context", c},
          {"encapsulatedKey", hex(enc)},
          {"ciphertext", b64(ciphertext)}};
}
Bytes open(const Json &envelope, EVP_PKEY *key, const Json &expected) {
  fields(envelope, {"format", "formatVersion", "suite", "context",
                    "encapsulatedKey", "ciphertext"});
  const auto &c = envelope.at("context");
  fields(c, {"purpose", "userId", "recipientKeyId", "deviceId", "workplaceId",
             "keyId"});
  require(envelope.at("format") == "full-frills-key-envelope" &&
              envelope.at("formatVersion") == 1 &&
              envelope.at("suite") == SUITE && binding(c) == binding(expected),
          "Key envelope context mismatch");
  require(fingerprint(publicBytes(key)) == field(expected, "recipientKeyId"),
          "Envelope recipient mismatch");
  auto info = binding(expected),
       enc = unhex(field(envelope, "encapsulatedKey"), 32),
       ciphertext = unb64(field(envelope, "ciphertext"), 4112);
  require(ciphertext.size() >= 16, "Invalid envelope ciphertext");
  Bytes plaintext(ciphertext.size() - 16);
  size_t size = plaintext.size();
  Hpke hpke(OSSL_HPKE_CTX_new(OSSL_HPKE_MODE_BASE, HPKE_SUITE,
                              OSSL_HPKE_ROLE_RECEIVER, nullptr, nullptr),
            OSSL_HPKE_CTX_free);
  if (!hpke ||
      OSSL_HPKE_decap(hpke.get(), enc.data(), enc.size(), key, info.data(),
                      info.size()) != 1 ||
      OSSL_HPKE_open(hpke.get(), plaintext.data(), &size, info.data(),
                     info.size(), ciphertext.data(), ciphertext.size()) != 1) {
    wipe(plaintext);
    throw std::runtime_error("Native envelope authentication failed");
  }
  plaintext.resize(size);
  return plaintext;
}
std::string identityFingerprint(const Json &identity) {
  fields(identity,
         {"format", "formatVersion", "userId", "encryptionAlgorithm",
          "encryptionPublicKey", "signingAlgorithm", "signingPublicKey"});
  require(identity.at("format") == "full-frills-user-identity" &&
              identity.at("formatVersion") == 1 &&
              identity.at("encryptionAlgorithm") == "X25519" &&
              identity.at("signingAlgorithm") == "Ed25519",
          "Unsupported User public identity");
  unhex(field(identity, "encryptionPublicKey"), 32);
  unhex(field(identity, "signingPublicKey"), 32);
  return fingerprint(
      bytes(Json::array({identity.at("format"), 1, identity.at("userId"),
                         "X25519", identity.at("encryptionPublicKey"),
                         "Ed25519", identity.at("signingPublicKey")})
                .dump()));
}
void checkPublicUser(const Json &user) {
  fields(user, {"format", "formatVersion", "userId", "publicIdentity",
                "userKeyFingerprint", "recoveryPublicKey", "recoveryEnvelope",
                "deviceId", "devicePublicKey", "deviceKeyId", "deviceEnvelope",
                "recoveryConfirmed"});

  require(user.at("format") == "full-frills-user-recovery" &&
              user.at("formatVersion") == 1 &&
              user.at("publicIdentity").at("userId") == user.at("userId") &&
              identityFingerprint(user.at("publicIdentity")) ==
                  field(user, "userKeyFingerprint"),
          "User identity scope mismatch");
}
struct UserSecret {
  Key encryption;
  Key signing;
};
UserSecret decodeBundle(const Bytes &bundle, const Json &user) {
  checkPublicUser(user);
  PrivateJson decoded(Json::parse(bundle.begin(), bundle.end()));
  fields(decoded.value,
         {"userId", "publicIdentity", "privateKey", "signingPrivateKey"});
  require(decoded.value.at("userId") == user.at("userId") &&
              identityFingerprint(decoded.value.at("publicIdentity")) ==
                  field(user, "userKeyFingerprint"),
          "Recovered User identity mismatch");
  Secret encryption(unhex(secretField(decoded.value, "privateKey"), 32));
  const auto &signing = secretField(decoded.value, "signingPrivateKey");
  require(signing.size() >= 96 && signing.size() <= 256 &&
              signing.size() % 2 == 0,
          "Invalid User signing key");
  Secret encoded(unhex(signing, signing.size() / 2));
  UserSecret result{rawKey(encryption.bytes), signingKey(encoded.bytes)};
  require(hex(publicBytes(result.encryption.get())) ==
                  field(user.at("publicIdentity"), "encryptionPublicKey") &&
              hex(publicBytes(result.signing.get())) ==
                  field(user.at("publicIdentity"), "signingPublicKey"),
          "User private/public key mismatch");
  return result;
}
std::string vaultName(const Json &user) {
  return "device_private_key_v1_" +
         fingerprint(
             bytes(
                 Json::array({user.at("userId"), user.at("deviceId")}).dump()))
             .substr(7);
}
Bytes userBundle(const Json &user, Vault &vault) {
  checkPublicUser(user);
  Secret device(vault.load(vaultName(user)));
  require(device.bytes.size() == 32,
          "Device private key is unavailable; use User recovery");
  auto key = rawKey(device.bytes);
  require(hex(publicBytes(key.get())) == field(user, "devicePublicKey") &&
              fingerprint(publicBytes(key.get())) == field(user, "deviceKeyId"),
          "Device private/public key mismatch");
  return open(user.at("deviceEnvelope"), key.get(),
              context("device-user-bundle", user, field(user, "deviceKeyId"),
                      field(user, "userKeyFingerprint"), "", field(user, "deviceId")));
}
UserSecret userSecret(const Json &user, Vault &vault) {
  Secret bundle(userBundle(user, vault));
  return decodeBundle(bundle.bytes, user);
}
Json recovery(const char *purpose, const std::string &identityId,
              const std::string &keyId, EVP_PKEY **recipient) {
  Secret seed(random(32));
  auto pair = encryptionPair(&seed.bytes);
  auto publicKey = publicBytes(pair.get());
  auto rid = fingerprint(publicKey);
  PrivateJson checksumInput(
      Json::array({1, purpose, identityId, keyId, rid, hex(seed.bytes)}));
  Secret serialized(secretDump(checksumInput.value));
  auto checksum = fingerprint(serialized.bytes).substr(7, 12);
  auto encoded = hex(seed.bytes);
  std::string phrase;
  for (size_t i = 0; i < encoded.size(); i += 8) {
    if (i)
      phrase += '-';
    phrase += encoded.substr(i, 8);
  }
  phrase += '-' + checksum;
  std::transform(phrase.begin(), phrase.end(), phrase.begin(),
                 [](unsigned char c) { return std::toupper(c); });
  Json result = {{"format", "full-frills-recovery-credential"},
                 {"formatVersion", 1},
                 {"purpose", purpose},
                 {"identityId", identityId},
                 {"identityKeyId", keyId},
                 {"recoveryKeyId", rid},
                 {"phrase", phrase}};
  OPENSSL_cleanse(encoded.data(), encoded.size());
  OPENSSL_cleanse(phrase.data(), phrase.size());
  *recipient = pair.release();
  return result;
}
Key recoveryKey(const Json &credential) {
  fields(credential, {"format", "formatVersion", "purpose", "identityId",
                      "identityKeyId", "recoveryKeyId", "phrase"});
  require(credential.size() == 7 &&
              credential.at("format") == "full-frills-recovery-credential" &&
              credential.at("formatVersion") == 1 &&
              (credential.at("purpose") == "user-recovery" ||
               credential.at("purpose") == "workplace-dump"),
          "Invalid recovery file");
  const auto &phrase = secretField(credential, "phrase");
  SecretString encodedSecret;
  auto &encoded = encodedSecret.value;
  for (unsigned char c : phrase)
    if (c != '-' && !std::isspace(c))
      encoded += static_cast<char>(std::tolower(c));
  require(encoded.size() == 76, "Invalid recovery phrase");
  Secret seed(unhex(std::string_view(encoded).substr(0, 64), 32));
  PrivateJson checksumInput(
      Json::array({1, credential.at("purpose"), credential.at("identityId"),
                   credential.at("identityKeyId"),
                   credential.at("recoveryKeyId"), hex(seed.bytes)}));
  Secret serialized(secretDump(checksumInput.value));
  bool valid =
      fingerprint(serialized.bytes).substr(7, 12) == encoded.substr(64);

  require(valid, "Recovery phrase checksum mismatch");
  auto key = encryptionPair(&seed.bytes);
  require(fingerprint(publicBytes(key.get())) ==
              field(credential, "recoveryKeyId"),
          "Recovery recipient mismatch");
  return key;
}
Bytes recoveryOpen(const Json &credential, const Json &envelope, const Json &c,
                   const std::string &id, const std::string &keyId) {
  require(credential.at("purpose") == c.at("purpose") &&
              field(credential, "identityId") == id &&
              field(credential, "identityKeyId") == keyId &&
              credential.at("recoveryKeyId") == c.at("recipientKeyId"),
          "Recovery credential identity mismatch");
  auto key = recoveryKey(credential);
  return open(envelope, key.get(), c);
}
Json recoveryContext(const Json &user) {
  return context("user-recovery", user,
                 fingerprint(unhex(field(user, "recoveryPublicKey"), 32)),
                 field(user, "userKeyFingerprint"));
}
Json memberContext(const Json &user, const Json &keys) {
  return context(
      "user-workplace-dek", user,
      fingerprint(
          unhex(field(user.at("publicIdentity"), "encryptionPublicKey"), 32)),
      field(keys, "keyId"), field(keys, "workplaceId"));
}
Json dumpContext(const Json &keys) {
  return context("workplace-dump", keys,
                 fingerprint(unhex(field(keys, "recoveryPublicKey"), 32)),
                 field(keys, "keyId"), field(keys, "workplaceId"));
}
Bytes memberKey(const Json &user, const Json &keys, Vault &vault) {
  fields(keys, {"format", "formatVersion", "userId", "workplaceId",
                "userKeyFingerprint", "keyId", "memberEnvelope",
                "recoveryPublicKey", "recoveryEnvelope", "recoveryConfirmed",
                "writerDeviceId", "encryptionInvocations"});

  require(keys.at("format") == "full-frills-workplace-keys" &&
              keys.at("formatVersion") == 1 &&
              keys.at("userId") == user.at("userId") &&
              keys.at("userKeyFingerprint") == user.at("userKeyFingerprint"),
          "Workplace member key scope mismatch");
  auto secret = userSecret(user, vault);
  auto dek = open(keys.at("memberEnvelope"), secret.encryption.get(),
                  memberContext(user, keys));
  if (dek.size() != 32 || fingerprint(dek) != field(keys, "keyId")) {
    wipe(dek);
    throw std::runtime_error("Workplace DEK identity mismatch");
  }
  return dek;
}
Bytes aes(const Bytes &key, const Bytes &nonce, const Bytes &aad,
          const Bytes &input, bool encrypt) {
  require(key.size() == 32 && nonce.size() == 12 &&
              input.size() <= MAX_SNAPSHOT + 16,
          "Invalid native snapshot cryptography");
  Cipher c(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
  require(!!c, "Native cipher allocation failed");
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
            "Native encryption failed");
    output.resize(first + last + 16);
    require(EVP_CIPHER_CTX_ctrl(c.get(), EVP_CTRL_GCM_GET_TAG, 16,
                                output.data() + first + last) == 1,
            "Native encryption tag failed");
  } else {
    require(input.size() >= 16, "Invalid encrypted snapshot");
    require(EVP_DecryptInit_ex(c.get(), EVP_aes_256_gcm(), nullptr, key.data(),
                               nonce.data()) == 1 &&
                EVP_DecryptUpdate(c.get(), nullptr, &ignored, aad.data(),
                                  aad.size()) == 1 &&
                EVP_DecryptUpdate(c.get(), output.data(), &first, input.data(),
                                  input.size() - 16) == 1 &&
                EVP_CIPHER_CTX_ctrl(c.get(), EVP_CTRL_GCM_SET_TAG, 16,
                                    const_cast<unsigned char *>(
                                        input.data() + input.size() - 16)) == 1,
            "Native decryption failed");
    if (EVP_DecryptFinal_ex(c.get(), output.data() + first, &last) != 1) {
      wipe(output);
      throw std::runtime_error("Native snapshot authentication failed");
    }
    output.resize(first + last);
  }
  return output;
}
Bytes snapshotAad(const Json &value) {
  return bytes(Json::array({value.at("format"), value.at("formatVersion"),
                            value.at("algorithm"), value.at("workplaceId"),
                            value.at("snapshotId"), value.at("schemaVersion"),
                            value.at("keyId"), "snapshot"})
                   .dump());
}
std::string decryptSnapshot(const Json &envelope, const Bytes &dek,
                            const std::string &workplace) {
  fields(envelope,
         {"format", "formatVersion", "algorithm", "workplaceId", "snapshotId",
          "schemaVersion", "keyId", "nonce", "ciphertext"});
  require(envelope.at("format") == "full-frills-encrypted-snapshot" &&
              envelope.at("formatVersion") == 2 &&
              envelope.at("algorithm") == "AES-256-GCM" &&
              field(envelope, "workplaceId") == workplace &&
              fingerprint(dek) == field(envelope, "keyId"),
          "Encrypted snapshot identity mismatch");
  unhex(field(envelope, "snapshotId"), 16);
  Secret plaintext(
      aes(dek, unhex(field(envelope, "nonce"), 12), snapshotAad(envelope),
          unb64(field(envelope, "ciphertext"), MAX_SNAPSHOT + 16), false));
  auto result = text(plaintext.bytes);
  auto source = Json::parse(result);
  require(source.at("workplace").at("id") == envelope.at("workplaceId") &&
              source.at("schemaVersion") == envelope.at("schemaVersion"),
          "Encrypted snapshot identity mismatch");
  return result;
}
} // namespace
void wipe(Bytes &value) {
  if (!value.empty())
    OPENSSL_cleanse(value.data(), value.size());
}
Engine &engine() {
  static Engine instance;
  return instance;
}
Engine::Credential::~Credential() { wipe(file); }
void Engine::setAllowed(bool allowed) {
  allowed_.store(allowed);
  epoch_.fetch_add(1);
}
void Engine::sweep() {
  for (auto it = credentials_.begin(); it != credentials_.end();) {
    if (std::chrono::steady_clock::now() - it->second.created >
        std::chrono::minutes(15))
      it = credentials_.erase(it);
    else
      ++it;
  }
}
Json Engine::retain(const Json &value) {
  sweep();
  require(credentials_.size() < 32, "Too many pending recovery files");
  auto id = hex(random(32));
  auto &saved = credentials_[id];
  saved.file = secretDump(value);
  saved.created = std::chrono::steady_clock::now();
  return {{"format", "full-frills-recovery-handle"},
          {"formatVersion", 1},
          {"purpose", value.at("purpose")},
          {"identityId", value.at("identityId")},
          {"identityKeyId", value.at("identityKeyId")},
          {"recoveryKeyId", value.at("recoveryKeyId")},
          {"handle", id}};
}
Json Engine::credential(const Json &handle) {
  sweep();
  fields(handle, {"format", "formatVersion", "purpose", "identityId",
                  "identityKeyId", "recoveryKeyId", "handle"});
  require(handle.size() == 7 &&
              handle.at("format") == "full-frills-recovery-handle" &&
              handle.at("formatVersion") == 1,
          "Choose a native recovery-file handle");
  auto found = credentials_.find(field(handle, "handle"));
  require(found != credentials_.end(),
          "Recovery file expired; choose it again");
  auto value =
      Json::parse(found->second.file.begin(), found->second.file.end());
  for (auto name : {"purpose", "identityId", "identityKeyId", "recoveryKeyId"})
    require(value.at(name) == handle.at(name),
            "Recovery handle identity mismatch");
  return value;
}
Json Engine::importCredential(const Bytes &file) {
  std::lock_guard<std::mutex> lock(mutex_);
  require(allowed_.load(), "Unlock the app before accessing encryption keys");
  require(file.size() <= 4096, "Recovery file is too large");
  PrivateJson value(Json::parse(file.begin(), file.end()));
  auto key = recoveryKey(value.value);
  return retain(value.value);
}
Bytes Engine::credentialFile(const Json &handle) {
  std::lock_guard<std::mutex> lock(mutex_);
  PrivateJson value(credential(handle));
  require(credentials_.at(field(handle, "handle")).leases == 1,
          "Recovery export requires an active lease");
  return secretDump(value.value);
}
void Engine::retainCredential(const Json &handle) {
  std::lock_guard<std::mutex> lock(mutex_);
  require(allowed_.load(), "Unlock the app before exporting recovery files");
  PrivateJson value(credential(handle));
  auto &entry = credentials_.at(field(handle, "handle"));
  require(entry.leases == 0, "Recovery file is already being exported");
  entry.leases = 1;
}
void Engine::releaseCredential(const Json &handle) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = credentials_.find(field(handle, "handle"));
  if (it != credentials_.end())
    credentials_.erase(it);
}
void Engine::clearCredentials() {
  std::lock_guard<std::mutex> lock(mutex_);
  for (auto it = credentials_.begin(); it != credentials_.end();) {
    if (!it->second.leases)
      it = credentials_.erase(it);
    else
      ++it;
  }
}
Json Engine::reference(const std::string &kind, const std::string &keyId,
                       const Json &source, const std::string &publicKey) {
  const auto now = std::chrono::steady_clock::now();
  for (auto it = keys_.begin(); it != keys_.end();) {
    if (it->second.epoch != epoch_.load() ||
        now - it->second.created > std::chrono::minutes(5))
      it = keys_.erase(it);
    else
      ++it;
  }
  require(keys_.size() < 64, "Too many open key references; release unused keys");
  auto token = hex(random(32));
  Json metadata = {{"format", "full-frills-native-key-reference"},
                   {"formatVersion", 1}, {"kind", kind},
                   {"keyId", keyId}, {"handle", token}};
  if (!publicKey.empty()) metadata["publicKey"] = publicKey;
  keys_.emplace(token, KeyReference{metadata, source, now, epoch_.load()});
  return metadata;
}
Json Engine::keySource(const Json &handle, const std::string &kind) {
  auto found = keys_.find(field(handle, "handle"));
  require(found != keys_.end(), "Key reference is unavailable; open its envelope again");
  require(sameReference(found->second.metadata, handle) && handle.at("kind") == kind &&
              found->second.epoch == epoch_.load() &&
              std::chrono::steady_clock::now() - found->second.created <=
                  std::chrono::minutes(5),
          "Key reference is invalid or expired");
  return found->second.source;
}
Json Engine::execute(const std::string &operation, const Json &input, Vault &vault) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool cleanup = operation == "removeKey" || operation == "releaseKey";
  require(allowed_.load() || cleanup,
          "Unlock the app before accessing encryption keys");
  auto epoch = epoch_.load();
  auto op = operation;
  Json request = input;
  Json result;
  if (op == "releaseKey") {
    fields(request, {"key"});
    const auto &handle = request.at("key");
    auto found = keys_.find(field(handle, "handle"));
    if (found != keys_.end()) {
      require(sameReference(found->second.metadata, handle), "Key reference identity mismatch");
      keys_.erase(found);
    }
    return nullptr;
  }
  if (op == "generateKeys") {
    auto kind = field(request, "kind");
    if (kind == "device") {
      fields(request, {"kind", "userId", "deviceId"});
      require(!field(request, "userId").empty() && !field(request, "deviceId").empty(),
              "Invalid User or Device identity");
      Secret existing(vault.load(vaultName(request)));
      require(existing.bytes.empty(), "Device identity already exists");
      auto device = encryptionPair();
      auto publicKey = hex(publicBytes(device.get()));
      auto pin = fingerprint(publicBytes(device.get()));
      Secret privateKey(privateBytes(device.get()));
      vault.save(vaultName(request), privateKey.bytes);
      Json scope = {{"userId", request.at("userId")}, {"deviceId", request.at("deviceId")},
                    {"devicePublicKey", publicKey}, {"deviceKeyId", pin}};
      result = reference("device", pin, scope, publicKey);
      require(allowed_.load() && epoch == epoch_.load(), "Key operation was cancelled by app lock");
      return result;
    }
    if (kind == "user") {
      fields(request, {"kind", "device"});
      auto deviceReference = request.at("device");
      request = keySource(deviceReference, "device");
      keys_.erase(field(deviceReference, "handle"));
      op = "createUser";
    } else if (kind == "workplace") {
      fields(request, {"kind", "user", "workplaceId"});
      auto source = keySource(request.at("user"), "user");
      request = {{"user", source.at("user")}, {"workplaceId", input.at("workplaceId")}};
      op = "enrollWorkplace";
    } else throw std::runtime_error("Unsupported key kind");
  } else if (op == "openKey") {
    auto kind = field(request, "kind");
    if (kind == "user") {
      fields(request, {"kind", "user"});
      const auto &user = request.at("user");
      userSecret(user, vault);
      result = reference("user", field(user, "userKeyFingerprint"), {{"user", user}},
                         field(user.at("publicIdentity"), "encryptionPublicKey"));
    } else if (kind == "workplace") {
      fields(request, {"kind", "user", "keys"});
      auto source = keySource(request.at("user"), "user");
      const auto &keys = request.at("keys");
      Secret dek(memberKey(source.at("user"), keys, vault));
      result = reference("workplace", field(keys, "keyId"),
                         {{"user", source.at("user")}, {"keys", keys}});
    } else throw std::runtime_error("Unsupported key kind");
    require(allowed_.load() && epoch == epoch_.load(), "Key operation was cancelled by app lock");
    return result;
  } else if (op == "wrapUserForDevice") {
    fields(request, {"key", "recipient"});
    auto source = keySource(request.at("key"), "user");
    const auto &user = source.at("user");
    const auto &recipient = request.at("recipient");
    fields(recipient, {"userId", "deviceId", "publicKey", "keyId"});
    require(user.at("recoveryConfirmed") == true &&
                recipient.at("userId") == user.at("userId") &&
                !field(recipient, "deviceId").empty(),
            "Device enrollment requires the same confirmed User");
    auto publicKey = field(recipient, "publicKey");
    auto devicePin = fingerprint(unhex(publicKey, 32));
    require(devicePin == field(recipient, "keyId"), "Device recipient fingerprint mismatch");
    Secret bundle(userBundle(user, vault));
    decodeBundle(bundle.bytes, user);
    auto envelope = seal(bundle.bytes, publicKey,
        context("device-user-bundle", user, devicePin, field(user, "userKeyFingerprint"),
                "", field(recipient, "deviceId")));
    result = {{"userId", user.at("userId")}, {"userKeyFingerprint", user.at("userKeyFingerprint")},
              {"deviceId", recipient.at("deviceId")}, {"devicePublicKey", publicKey},
              {"deviceKeyId", devicePin}, {"deviceEnvelope", envelope}};
    require(allowed_.load() && epoch == epoch_.load(), "Key operation was cancelled by app lock");
    return result;
  } else if (op == "wrapWorkplaceForUser") {
    fields(request, {"key", "recipient", "userKeyFingerprint"});
    auto source = keySource(request.at("key"), "workplace");
    const auto &user = source.at("user");
    const auto &keys = source.at("keys");
    const auto &recipient = request.at("recipient");
    auto userPin = identityFingerprint(recipient);
    require(userPin == field(request, "userKeyFingerprint") &&
                !field(recipient, "userId").empty(), "User recipient fingerprint mismatch");
    require(user.at("recoveryConfirmed") == true && keys.at("recoveryConfirmed") == true,
            "Confirm recovery files before sharing a Workplace key");
    Secret dek(memberKey(user, keys, vault));
    auto publicKey = field(recipient, "encryptionPublicKey");
    auto envelope = seal(dek.bytes, publicKey,
        context("user-workplace-dek", recipient, fingerprint(unhex(publicKey, 32)),
                field(keys, "keyId"), field(keys, "workplaceId")));
    result = {{"workplaceId", keys.at("workplaceId")}, {"keyId", keys.at("keyId")},
              {"userId", recipient.at("userId")}, {"userKeyFingerprint", userPin},
              {"memberEnvelope", envelope}};
    require(allowed_.load() && epoch == epoch_.load(), "Key operation was cancelled by app lock");
    return result;
  } else if (op == "encrypt" || op == "decrypt") {
    fields(request, op == "encrypt" ? std::initializer_list<const char *>{"key", "plaintext"}
                                    : std::initializer_list<const char *>{"key", "snapshot"});
    auto source = keySource(request.at("key"), "workplace");
    request = source;
    request[op == "encrypt" ? "plaintext" : "snapshot"] =
        input.at(op == "encrypt" ? "plaintext" : "snapshot");
    op = op == "encrypt" ? "encryptSnapshot" : "decryptSnapshot";
  } else if (op == "sign") {
    fields(request, {"key", "digest"});
    auto source = keySource(request.at("key"), "user");
    request = {{"user", source.at("user")}, {"digest", input.at("digest")}};
  } else if (op == "hasKey" || op == "removeKey") {
    fields(request, {"kind", "userId", "deviceId"});
    require(request.at("kind") == "device", "Only Device keys are persisted in the vault");
    require(!field(request, "userId").empty() && !field(request, "deviceId").empty(),
            "Invalid User or Device identity");
    op = op == "hasKey" ? "hasDevice" : "removeDevice";
  } else {
    require(op == "confirmUser" || op == "validateRecovery" || op == "recoverUser" ||
                op == "confirmWorkplace" || op == "decryptDump",
            "Unsupported native key operation");
  }
  if (op == "hasDevice" || op == "removeDevice") {
    auto name = vaultName(request);
    if (op == "removeDevice") {
      vault.remove(name);
      result = nullptr;
    } else {
      Secret key(vault.load(name));
      require(key.bytes.empty() || key.bytes.size() == 32,
              "Invalid Device private key");
      result = !key.bytes.empty();
    }
  } else if (op == "createUser") {
    auto userId = field(request, "userId"),
         deviceId = field(request, "deviceId");
    require(!userId.empty() && !deviceId.empty(),
            "Invalid User or Device identity");
    Secret existing(vault.load(vaultName(request)));
    require(existing.bytes.size() == 32, "Device private key is unavailable; use User recovery");
    auto device = rawKey(existing.bytes);
    require(hex(publicBytes(device.get())) == field(request, "devicePublicKey") &&
                fingerprint(publicBytes(device.get())) == field(request, "deviceKeyId"),
            "Device reference identity mismatch");
    auto encryption = encryptionPair(), signing = signingPair();
    Json identity = {
        {"format", "full-frills-user-identity"},
        {"formatVersion", 1},
        {"userId", userId},
        {"encryptionAlgorithm", "X25519"},
        {"encryptionPublicKey", hex(publicBytes(encryption.get()))},
        {"signingAlgorithm", "Ed25519"},
        {"signingPublicKey", hex(publicBytes(signing.get()))}};
    auto pin = identityFingerprint(identity);
    EVP_PKEY *recoveryRaw = nullptr;
    PrivateJson secret(recovery("user-recovery", userId, pin, &recoveryRaw));
    Key recoveryPair(recoveryRaw, EVP_PKEY_free);
    Secret privateKey(privateBytes(encryption.get())),
        signingPrivate(pkcs8(signing.get()));
    PrivateJson rawBundle(Json{{"userId", userId},
                               {"publicIdentity", identity},
                               {"signingPrivateKey", hex(signingPrivate.bytes)},
                               {"privateKey", hex(privateKey.bytes)}});
    Secret bundle(secretDump(rawBundle.value));
    auto deviceIdHash = fingerprint(publicBytes(device.get()));
    Json user = {{"format", "full-frills-user-recovery"},
                 {"formatVersion", 1},
                 {"userId", userId},
                 {"publicIdentity", identity},
                 {"userKeyFingerprint", pin},
                 {"deviceId", deviceId},
                 {"devicePublicKey", hex(publicBytes(device.get()))},
                 {"deviceKeyId", deviceIdHash},
                 {"recoveryPublicKey", hex(publicBytes(recoveryPair.get()))},
                 {"recoveryConfirmed", false}};
    user["recoveryEnvelope"] = seal(
        bundle.bytes, field(user, "recoveryPublicKey"), recoveryContext(user));
    user["deviceEnvelope"] = seal(
        bundle.bytes, field(user, "devicePublicKey"),
        context("device-user-bundle", user, deviceIdHash, pin, "", deviceId));
    userSecret(user, vault);
    result = {{"user", user}, {"credential", retain(secret.value)},
              {"key", reference("user", pin, {{"user", user}},
                                field(identity, "encryptionPublicKey"))}};
  } else if (op == "sign" || op == "enrollWorkplace") {
    const auto &user = request.at("user");
    auto secret = userSecret(user, vault);
    if (op == "sign") {
      require(user.at("recoveryConfirmed") == true,
              "Confirm User recovery first");
      auto digest = field(request, "digest");
      require(digest.size() == 71 && digest.substr(0, 7) == "sha256:",
              "Invalid recovery manifest digest");
      unhex(digest.substr(7), 32);
      auto message =
          bytes(Json::array({"full-frills-local-recovery", 1, user.at("userId"),
                             user.at("userKeyFingerprint"), digest})
                    .dump());
      Bytes signature(64);
      size_t size = 64;
      Digest ctx(EVP_MD_CTX_new(), EVP_MD_CTX_free);
      require(!!ctx &&
                  EVP_DigestSignInit(ctx.get(), nullptr, nullptr, nullptr,
                                     secret.signing.get()) == 1 &&
                  EVP_DigestSign(ctx.get(), signature.data(), &size,
                                 message.data(), message.size()) == 1 &&
                  size == 64,
              "Native signing failed");
      result = hex(signature);
    } else {
      require(user.at("recoveryConfirmed") == true,
              "Confirm User recovery first");
      auto workplace = field(request, "workplaceId");
      require(!workplace.empty() && workplace.size() <= 128,
              "Invalid Workplace identity");
      Secret dek(random(32));
      auto pin = fingerprint(dek.bytes);
      EVP_PKEY *recoveryRaw = nullptr;
      PrivateJson credentialValue(
          recovery("workplace-dump", workplace, pin, &recoveryRaw));
      Key recoveryPair(recoveryRaw, EVP_PKEY_free);
      Json keys = {{"format", "full-frills-workplace-keys"},
                   {"formatVersion", 1},
                   {"userId", user.at("userId")},
                   {"workplaceId", workplace},
                   {"userKeyFingerprint", user.at("userKeyFingerprint")},
                   {"keyId", pin},
                   {"recoveryPublicKey", hex(publicBytes(recoveryPair.get()))},
                   {"recoveryConfirmed", false},
                   {"writerDeviceId", user.at("deviceId")},
                   {"encryptionInvocations", 0}};
      keys["memberEnvelope"] = seal(
          dek.bytes, field(user.at("publicIdentity"), "encryptionPublicKey"),
          memberContext(user, keys));
      keys["recoveryEnvelope"] =
          seal(dek.bytes, field(keys, "recoveryPublicKey"), dumpContext(keys));
      result = {{"keys", keys}, {"credential", retain(credentialValue.value)},
                {"key", reference("workplace", pin, {{"user", user}, {"keys", keys}})}};
    }
  } else if (op == "confirmUser" || op == "validateRecovery" ||
             op == "recoverUser") {
    const auto &user = request.at("user");
    checkPublicUser(user);
    PrivateJson credentialValue(credential(request.at("credential")));
    Secret bundle(recoveryOpen(credentialValue.value,
                               user.at("recoveryEnvelope"),
                               recoveryContext(user), field(user, "userId"),
                               field(user, "userKeyFingerprint")));
    decodeBundle(bundle.bytes, user);
    if (op != "recoverUser")
      result = true;
    else {
      auto deviceId = field(request, "deviceId");
      require(!deviceId.empty(), "Invalid replacement Device identity");
      Json replacement = user;
      replacement["deviceId"] = deviceId;
      Secret existing(vault.load(vaultName(replacement)));
      require(existing.bytes.empty(), "Device identity already exists");
      auto device = encryptionPair();
      auto pin = fingerprint(publicBytes(device.get()));
      replacement["devicePublicKey"] = hex(publicBytes(device.get()));
      replacement["deviceKeyId"] = pin;
      replacement["deviceEnvelope"] =
          seal(bundle.bytes, field(replacement, "devicePublicKey"),
               context("device-user-bundle", replacement, pin,
                       field(user, "userKeyFingerprint"), "", deviceId));
      replacement["recoveryConfirmed"] = true;
      Secret privateKey(privateBytes(device.get()));
      vault.save(vaultName(replacement), privateKey.bytes);
      userSecret(replacement, vault);
      result = replacement;
    }
  } else if (op == "confirmWorkplace" ||
             op == "encryptSnapshot" || op == "decryptSnapshot") {
    const auto &user = request.at("user");
    const auto &keys = request.at("keys");
    Secret dek(memberKey(user, keys, vault));
    if (op == "confirmWorkplace") {
      PrivateJson credentialValue(credential(request.at("credential")));
      Secret recovered(recoveryOpen(
          credentialValue.value, keys.at("recoveryEnvelope"), dumpContext(keys),
          field(keys, "workplaceId"), field(keys, "keyId")));
      require(recovered.bytes.size() == 32 &&
                  CRYPTO_memcmp(dek.bytes.data(), recovered.bytes.data(), 32) ==
                      0,
              "Member and recovery DEKs differ");
      result = true;
    } else {
      require(user.at("recoveryConfirmed") == true &&
                  keys.at("recoveryConfirmed") == true,
              "Confirm recovery files first");
      if (op == "decryptSnapshot")
        result = decryptSnapshot(request.at("snapshot"), dek.bytes,
                                 field(keys, "workplaceId"));
      else {
        require(keys.at("writerDeviceId") == user.at("deviceId") &&
                    keys.at("encryptionInvocations").is_number_integer() &&
                    keys.at("encryptionInvocations").get<long long>() > 0 &&
                    keys.at("encryptionInvocations").get<long long>() <=
                        (1 << 20),
                "Backup writer or reserved budget is invalid");
        auto source = field(request, "plaintext");
        require(source.size() <= MAX_SNAPSHOT, "Snapshot is too large");
        auto snapshot = Json::parse(source);
        require(snapshot.at("workplace").at("id") == keys.at("workplaceId"),
                "Snapshot Workplace mismatch");
        Json envelope = {{"format", "full-frills-encrypted-snapshot"},
                         {"formatVersion", 2},
                         {"algorithm", "AES-256-GCM"},
                         {"workplaceId", keys.at("workplaceId")},
                         {"snapshotId", hex(random(16))},
                         {"schemaVersion", snapshot.at("schemaVersion")},
                         {"keyId", keys.at("keyId")}};
        auto nonce = random(12);
        Secret plaintext(bytes(source));
        envelope["nonce"] = hex(nonce);
        envelope["ciphertext"] = b64(aes(
            dek.bytes, nonce, snapshotAad(envelope), plaintext.bytes, true));
        result = envelope;
      }
    }
  } else if (op == "decryptDump") {
    const auto &dump = request.at("dump");
    fields(dump,
           {"format", "formatVersion", "workplaceId", "ownerUserId", "keyId",
            "recoveryPublicKey", "recoveryEnvelope", "snapshot"});

    require(dump.at("format") == "full-frills-workplace-dump" &&
                dump.at("formatVersion") == 1,
            "Invalid Workplace dump");
    Json keys = dump;
    keys["userId"] = dump.at("ownerUserId");
    PrivateJson credentialValue(credential(request.at("credential")));
    Secret dek(recoveryOpen(credentialValue.value, dump.at("recoveryEnvelope"),
                            dumpContext(keys), field(dump, "workplaceId"),
                            field(dump, "keyId")));
    require(dek.bytes.size() == 32 &&
                fingerprint(dek.bytes) == field(dump, "keyId"),
            "Workplace dump DEK mismatch");
    result = decryptSnapshot(dump.at("snapshot"), dek.bytes,
                             field(dump, "workplaceId"));
  } else
    throw std::runtime_error("Unsupported native key operation");
  require(cleanup || (allowed_.load() && epoch == epoch_.load()),
          "Key operation was cancelled by app lock");
  return result;
}
#ifdef FFB_KEY_CRYPTO_TEST
Json testAes(const Json &request) {
  Secret key(unhex(field(request, "key"), 32));
  auto input = field(request, "plaintext");
  Secret plaintext(unhex(input, input.size() / 2));
  return hex(aes(key.bytes, unhex(field(request, "nonce"), 12), {}, plaintext.bytes, true));
}
#endif
} // namespace ffb
