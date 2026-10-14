#include "ProtocolEnvelopes.hpp"
#include <algorithm>
#include <cctype>

namespace ffb::detail {
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
             const std::string &workplace, const std::string &device) {
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
          "Native envelope encryption failed", ErrorCode::OperationFailed);
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
    throw OperationError(ErrorCode::AuthenticationFailed,
                         "Native envelope authentication failed");
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
          "Device private key is unavailable; use User recovery",
          ErrorCode::RecoveryRequired);
  auto key = rawKey(device.bytes);
  require(hex(publicBytes(key.get())) == field(user, "devicePublicKey") &&
              fingerprint(publicBytes(key.get())) == field(user, "deviceKeyId"),
          "Device private/public key mismatch");
  return open(user.at("deviceEnvelope"), key.get(),
              context("device-user-bundle", user, field(user, "deviceKeyId"),
                      field(user, "userKeyFingerprint"), "",
                      field(user, "deviceId")));
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
    throw OperationError(ErrorCode::InvalidFile,
                         "Workplace DEK identity mismatch");
  }
  return dek;
}
} // namespace ffb::detail
