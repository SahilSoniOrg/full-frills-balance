#include "ProtocolEnvelopes.hpp"
#include "SnapshotCrypto.hpp"

namespace ffb {
using namespace detail;
Engine &engine() {
  static Engine instance;
  return instance;
}
Engine::Credential::~Credential() { wipe(file); }
void Engine::setAllowed(bool allowed) {
  allowed_.store(allowed);
  epoch_.fetch_add(1);
  if (!allowed) {
    std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock);
    if (lock.owns_lock()) clearUnleasedCredentials();
    // A running execute clears its unleased credentials before reporting cancellation.
  }
}
void Engine::sweep() {
  for (auto it = credentials_.begin(); it != credentials_.end();) {
    if ((!it->second.leases && it->second.epoch != epoch_.load()) || std::chrono::steady_clock::now() - it->second.created >
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
  saved.epoch = epoch_.load();
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
  require(found != credentials_.end(), "Recovery file expired; choose it again",
          ErrorCode::ReferenceExpired);
  auto value =
      Json::parse(found->second.file.begin(), found->second.file.end());
  for (auto name : {"purpose", "identityId", "identityKeyId", "recoveryKeyId"})
    require(value.at(name) == handle.at(name),
            "Recovery handle identity mismatch");
  return value;
}
Json Engine::importCredential(const Bytes &file) {
  std::lock_guard<std::mutex> lock(mutex_);
  require(allowed_.load(), "Unlock the app before accessing encryption keys",
          ErrorCode::Locked);
  const auto epoch = epoch_.load();
  require(file.size() <= 4096, "Recovery file is too large");
  PrivateJson value(Json::parse(file.begin(), file.end()));
  auto key = recoveryKey(value.value);
  auto result = retain(value.value);
  if (!allowed_.load() || epoch != epoch_.load()) {
    clearUnleasedCredentials();
    throw OperationError(ErrorCode::Cancelled, "Recovery file import was cancelled");
  }
  return result;
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
  require(allowed_.load(), "Unlock the app before exporting recovery files",
          ErrorCode::Locked);
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
  clearUnleasedCredentials();
}
void Engine::clearUnleasedCredentials() {
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
  require(keys_.size() < 64,
          "Too many open key references; release unused keys");
  auto token = hex(random(32));
  Json metadata = {{"format", "full-frills-native-key-reference"},
                   {"formatVersion", 1},
                   {"kind", kind},
                   {"keyId", keyId},
                   {"handle", token}};
  if (!publicKey.empty())
    metadata["publicKey"] = publicKey;
  keys_.emplace(token, KeyReference{metadata, source, now, epoch_.load()});
  return metadata;
}
Json Engine::keySource(const Json &handle, const std::string &kind) {
  auto found = keys_.find(field(handle, "handle"));
  require(found != keys_.end(),
          "Key reference is unavailable; open its envelope again",
          ErrorCode::ReferenceExpired);
  require(sameReference(found->second.metadata, handle) &&
              handle.at("kind") == kind &&
              found->second.epoch == epoch_.load() &&
              std::chrono::steady_clock::now() - found->second.created <=
                  std::chrono::minutes(5),
          "Key reference is invalid or expired", ErrorCode::ReferenceExpired);
  return found->second.source;
}
// Protects native handle registries/vault operations, not asynchronous JS
// checkpoints.
Json Engine::execute(const std::string &operation, const Json &request,
                     Vault &vault) {
  std::lock_guard<std::mutex> lock(mutex_);
  const bool cleanup = operation == "removeKey" || operation == "releaseKey";
  require(allowed_.load() || cleanup,
          "Unlock the app before accessing encryption keys", ErrorCode::Locked);
  const auto epoch = epoch_.load();
  sweep();
  auto result = dispatch(operation, request, vault);
  if (!cleanup && (!allowed_.load() || epoch != epoch_.load())) {
    clearUnleasedCredentials();
    try {
      if (operation == "generateKeys" && request.at("kind") == "device") vault.remove(vaultName(request));
      if (operation == "recoverUser") vault.remove(vaultName(result));
    } catch (...) { /* Preserve the cancellation error; reconciliation handles unavailable vaults. */ }
  }
  require(cleanup || (allowed_.load() && epoch == epoch_.load()),
          "Key operation was cancelled by app lock", ErrorCode::Cancelled);
  return result;
}

Json Engine::dispatch(const std::string &operation, const Json &request,
                      Vault &vault) {
  if (operation == "releaseKey") {
    fields(request, {"key"});
    const auto &handle = request.at("key");
    auto found = keys_.find(field(handle, "handle"));
    if (found != keys_.end()) {
      require(sameReference(found->second.metadata, handle),
              "Key reference identity mismatch");
      keys_.erase(found);
    }
    return nullptr;
  }
  if (operation == "generateKeys")
    return generateKeys(request, vault);
  if (operation == "openKey")
    return openKey(request, vault);
  if (operation == "wrapUserForDevice")
    return wrapUserForDevice(request, vault);
  if (operation == "wrapWorkplaceForUser")
    return wrapWorkplaceForUser(request, vault);
  if (operation == "encrypt" || operation == "decrypt")
    return snapshotCrypto(request, operation == "encrypt", vault);
  if (operation == "sign") {
    fields(request, {"key", "digest"});
    auto source = keySource(request.at("key"), "user");
    return sign(source.at("user"), field(request, "digest"), vault);
  }
  if (operation == "hasKey" || operation == "removeKey") {
    fields(request, {"kind", "userId", "deviceId"});
    require(request.at("kind") == "device",
            "Only Device keys are persisted in the vault");
    require(!field(request, "userId").empty() &&
                !field(request, "deviceId").empty(),
            "Invalid User or Device identity");
    auto name = vaultName(request);
    if (operation == "removeKey") {
      vault.remove(name);
      return nullptr;
    }
    Secret key(vault.load(name));
    require(key.bytes.empty() || key.bytes.size() == 32,
            "Invalid Device private key");
    return !key.bytes.empty();
  }
  if (operation == "confirmUser" || operation == "validateRecovery" ||
      operation == "recoverUser")
    return recoverUser(request, operation == "recoverUser", vault);
  if (operation == "confirmWorkplace")
    return confirmWorkplace(request, vault);
  throw OperationError(ErrorCode::InvalidFile,
                       "Unsupported native key operation");
}

Json Engine::generateKeys(const Json &request, Vault &vault) {
  const auto &kind = field(request, "kind");
  if (kind == "device") {
    fields(request, {"kind", "userId", "deviceId"});
    require(!field(request, "userId").empty() &&
                !field(request, "deviceId").empty(),
            "Invalid User or Device identity");
    Secret existing(vault.load(vaultName(request)));
    require(existing.bytes.empty(), "Device identity already exists");
    auto device = encryptionPair();
    auto publicKey = hex(publicBytes(device.get()));
    auto pin = fingerprint(publicBytes(device.get()));
    Secret privateKey(privateBytes(device.get()));
    vault.save(vaultName(request), privateKey.bytes);
    Json scope = {{"userId", request.at("userId")},
                  {"deviceId", request.at("deviceId")},
                  {"devicePublicKey", publicKey},
                  {"deviceKeyId", pin}};
    return reference("device", pin, scope, publicKey);
  }
  if (kind == "user") {
    fields(request, {"kind", "device"});
    const auto &handle = request.at("device");
    auto scope = keySource(handle, "device");
    keys_.erase(field(handle, "handle"));
    return createUser(scope, vault);
  }
  if (kind == "workplace") {
    fields(request, {"kind", "user", "workplaceId"});
    auto source = keySource(request.at("user"), "user");
    return enrollWorkplace(source.at("user"), field(request, "workplaceId"),
                           vault);
  }
  throw OperationError(ErrorCode::InvalidFile, "Unsupported key kind");
}

Json Engine::openKey(const Json &request, Vault &vault) {
  auto kind = field(request, "kind");
  if (kind == "user") {
    fields(request, {"kind", "user"});
    const auto &user = request.at("user");
    userSecret(user, vault);
    return reference("user", field(user, "userKeyFingerprint"),
                     {{"user", user}},
                     field(user.at("publicIdentity"), "encryptionPublicKey"));
  } else if (kind == "workplace") {
    fields(request, {"kind", "user", "keys"});
    auto source = keySource(request.at("user"), "user");
    const auto &keys = request.at("keys");
    Secret dek(memberKey(source.at("user"), keys, vault));
    return reference("workplace", field(keys, "keyId"),
                     {{"user", source.at("user")}, {"keys", keys}});
  } else
    throw OperationError(ErrorCode::InvalidFile, "Unsupported key kind");
}

Json Engine::wrapUserForDevice(const Json &request, Vault &vault) {
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
  require(devicePin == field(recipient, "keyId"),
          "Device recipient fingerprint mismatch");
  Secret bundle(userBundle(user, vault));
  decodeBundle(bundle.bytes, user);
  auto envelope = seal(bundle.bytes, publicKey,
                       context("device-user-bundle", user, devicePin,
                               field(user, "userKeyFingerprint"), "",
                               field(recipient, "deviceId")));
  return {{"userId", user.at("userId")},
          {"userKeyFingerprint", user.at("userKeyFingerprint")},
          {"deviceId", recipient.at("deviceId")},
          {"devicePublicKey", publicKey},
          {"deviceKeyId", devicePin},
          {"deviceEnvelope", envelope}};
}

Json Engine::wrapWorkplaceForUser(const Json &request, Vault &vault) {
  fields(request, {"key", "recipient", "userKeyFingerprint"});
  auto source = keySource(request.at("key"), "workplace");
  const auto &user = source.at("user");
  const auto &keys = source.at("keys");
  const auto &recipient = request.at("recipient");
  auto userPin = identityFingerprint(recipient);
  require(userPin == field(request, "userKeyFingerprint") &&
              !field(recipient, "userId").empty(),
          "User recipient fingerprint mismatch");
  require(user.at("recoveryConfirmed") == true &&
              keys.at("recoveryConfirmed") == true,
          "Confirm recovery files before sharing a Workplace key");
  Secret dek(memberKey(user, keys, vault));
  auto publicKey = field(recipient, "encryptionPublicKey");
  auto envelope =
      seal(dek.bytes, publicKey,
           context("user-workplace-dek", recipient,
                   fingerprint(unhex(publicKey, 32)), field(keys, "keyId"),
                   field(keys, "workplaceId")));
  return {{"workplaceId", keys.at("workplaceId")},
          {"keyId", keys.at("keyId")},
          {"userId", recipient.at("userId")},
          {"userKeyFingerprint", userPin},
          {"memberEnvelope", envelope}};
}

Json Engine::createUser(const Json &request, Vault &vault) {
  auto userId = field(request, "userId"), deviceId = field(request, "deviceId");
  require(!userId.empty() && !deviceId.empty(),
          "Invalid User or Device identity");
  Secret existing(vault.load(vaultName(request)));
  require(existing.bytes.size() == 32,
          "Device private key is unavailable; use User recovery",
          ErrorCode::RecoveryRequired);
  auto device = rawKey(existing.bytes);
  require(hex(publicBytes(device.get())) == field(request, "devicePublicKey") &&
              fingerprint(publicBytes(device.get())) ==
                  field(request, "deviceKeyId"),
          "Device reference identity mismatch");
  auto encryption = encryptionPair(), signing = signingPair();
  Json identity = {{"format", "full-frills-user-identity"},
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
  return {{"user", user},
          {"credential", retain(secret.value)},
          {"key", reference("user", pin, {{"user", user}},
                            field(identity, "encryptionPublicKey"))}};
}

Json Engine::sign(const Json &user, const std::string &digest, Vault &vault) {
  auto secret = userSecret(user, vault);

  require(user.at("recoveryConfirmed") == true, "Confirm User recovery first");
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
              EVP_DigestSign(ctx.get(), signature.data(), &size, message.data(),
                             message.size()) == 1 &&
              size == 64,
          "Native signing failed", ErrorCode::OperationFailed);
  return hex(signature);
}

Json Engine::enrollWorkplace(const Json &user, const std::string &workplace,
                             Vault &vault) {
  auto secret = userSecret(user, vault);

  require(user.at("recoveryConfirmed") == true, "Confirm User recovery first");
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
  keys["memberEnvelope"] =
      seal(dek.bytes, field(user.at("publicIdentity"), "encryptionPublicKey"),
           memberContext(user, keys));
  keys["recoveryEnvelope"] =
      seal(dek.bytes, field(keys, "recoveryPublicKey"), dumpContext(keys));
  return {
      {"keys", keys},
      {"credential", retain(credentialValue.value)},
      {"key", reference("workplace", pin, {{"user", user}, {"keys", keys}})}};
}

Json Engine::recoverUser(const Json &request, bool installDevice,
                         Vault &vault) {
  const auto &user = request.at("user");
  checkPublicUser(user);
  PrivateJson credentialValue(credential(request.at("credential")));
  Secret bundle(recoveryOpen(credentialValue.value, user.at("recoveryEnvelope"),
                             recoveryContext(user), field(user, "userId"),
                             field(user, "userKeyFingerprint")));
  decodeBundle(bundle.bytes, user);
  if (!installDevice)
    return true;
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
    vault.saveRecovered(vaultName(replacement), privateKey.bytes);
    userSecret(replacement, vault);
    return replacement;
  }
}

Json Engine::confirmWorkplace(const Json &request, Vault &vault) {
  const auto &user = request.at("user");
  const auto &keys = request.at("keys");
  Secret dek(memberKey(user, keys, vault));

  PrivateJson credentialValue(credential(request.at("credential")));
  Secret recovered(recoveryOpen(
      credentialValue.value, keys.at("recoveryEnvelope"), dumpContext(keys),
      field(keys, "workplaceId"), field(keys, "keyId")));
  require(recovered.bytes.size() == 32 &&
              CRYPTO_memcmp(dek.bytes.data(), recovered.bytes.data(), 32) == 0,
          "Member and recovery DEKs differ");
  return true;
}

Json Engine::snapshotCrypto(const Json &request, bool encrypt, Vault &vault) {
  fields(request, encrypt
                      ? std::initializer_list<const char *>{"key", "plaintext"}
                      : std::initializer_list<const char *>{"key", "snapshot"});
  auto source = keySource(request.at("key"), "workplace");
  const auto &user = source.at("user");
  const auto &keys = source.at("keys");
  Secret dek(memberKey(user, keys, vault));
  require(user.at("recoveryConfirmed") == true &&
              keys.at("recoveryConfirmed") == true,
          "Confirm recovery files first");
  if (!encrypt)
    return decryptSnapshot(request.at("snapshot"), dek.bytes,
                           field(keys, "workplaceId"));
  require(keys.at("writerDeviceId") == user.at("deviceId") &&
              keys.at("encryptionInvocations").is_number_integer() &&
              keys.at("encryptionInvocations").get<long long>() > 0 &&
              keys.at("encryptionInvocations").get<long long>() <= (1 << 20),
          "Backup writer or reserved budget is invalid");
  return encryptSnapshot(field(request, "plaintext"), dek.bytes, keys);
}

} // namespace ffb
