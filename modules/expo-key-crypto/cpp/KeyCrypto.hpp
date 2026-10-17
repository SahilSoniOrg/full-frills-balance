#pragma once
#include <atomic>
#include <chrono>
#include <exception>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <vector>

namespace ffb {
using Json = nlohmann::ordered_json;
using Bytes = std::vector<unsigned char>;
enum class ErrorCode {
  Locked,
  RecoveryRequired,
  VaultUnavailable,
  InvalidFile,
  AuthenticationFailed,
  ReferenceExpired,
  Cancelled,
  RowUnknownDict,
  RowTooLarge,
  RowIntegrity,
  OperationFailed
};
class OperationError final : public std::runtime_error {
public:
  ErrorCode code;
  OperationError(ErrorCode code, const char *message)
      : std::runtime_error(message), code(code) {}
};
// Bridges publish only allowlisted codes, never parser/crypto exception text.
const char *
safeErrorCode(std::exception_ptr error = std::current_exception()) noexcept;
// Platform adapters implement this interface without ever returning key bytes
// to JS.
class Vault {
public:
  virtual ~Vault() = default;
  virtual Bytes load(const std::string &name) = 0;
  virtual void save(const std::string &name, const Bytes &key) = 0;
  // Called only after native recovery has authenticated the saved User bundle.
  virtual void saveRecovered(const std::string &name, const Bytes &key) { save(name, key); }
  virtual void remove(const std::string &name) = 0;
  virtual void clear() = 0;
};
class Engine {
public:
  void setAllowed(bool allowed);
  Json execute(const std::string &operation, Json request, Vault &vault);
  Json importCredential(const Bytes &file);
  Bytes credentialFile(const Json &handle);
  void retainCredential(const Json &handle);
  void releaseCredential(const Json &handle);
  void clearCredentials();

private:
  Json dispatch(const std::string &operation, const Json &request,
                Vault &vault);
  Json generateKeys(const Json &request, Vault &vault);
  Json openKey(const Json &request, Vault &vault);
  Json wrapUserForDevice(const Json &request, Vault &vault);
  Json wrapWorkplaceForUser(const Json &request, Vault &vault);
  Json createUser(const Json &device, Vault &vault);
  Json enrollWorkplace(const Json &user, const std::string &workplace,
                       Vault &vault);
  Json recoverUser(const Json &request, bool installDevice, Vault &vault);
  Json confirmWorkplace(const Json &request, Vault &vault);
  struct Credential {
    Bytes file;
    std::chrono::steady_clock::time_point created;
    unsigned leases = 0;
    unsigned long long epoch = 0;
    ~Credential();
  };
  std::atomic<bool> allowed_{false};
  std::atomic<unsigned long long> epoch_{0};
  std::mutex mutex_;
  struct KeyReference {
    Json metadata;
    Json source; // Public identity and ciphertext only. Never unwrapped keys.
    std::chrono::steady_clock::time_point created;
    unsigned long long epoch;
  };
  std::map<std::string, Credential> credentials_;
  std::map<std::string, KeyReference> keys_;
  Json reference(const std::string &kind, const std::string &keyId,
                 const Json &source, const std::string &publicKey = "");
  Json keySource(const Json &handle, const std::string &kind);
  Json retain(const Json &credential);
  Json credential(const Json &handle);
  void sweep();
  void clearUnleasedCredentials();
};
Engine &engine();
void wipe(Bytes &value);
#ifdef FFB_KEY_CRYPTO_TEST
Json testAes(const Json &request);
#endif
} // namespace ffb
