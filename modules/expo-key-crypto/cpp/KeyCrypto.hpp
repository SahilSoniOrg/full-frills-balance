#pragma once
#include <atomic>
#include <chrono>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace ffb {
using Json = nlohmann::ordered_json;
using Bytes = std::vector<unsigned char>;
// Platform adapters implement this interface without ever returning key bytes
// to JS.
class Vault {
public:
  virtual ~Vault() = default;
  virtual Bytes load(const std::string &name) = 0;
  virtual void save(const std::string &name, const Bytes &key) = 0;
  virtual void remove(const std::string &name) = 0;
};
class Engine {
public:
  void setAllowed(bool allowed);
  Json execute(const std::string &operation, const Json &request, Vault &vault);
  Json importCredential(const Bytes &file);
  Bytes credentialFile(const Json &handle);
  void retainCredential(const Json &handle);
  void releaseCredential(const Json &handle);
  void clearCredentials();

private:
  struct Credential {
    Bytes file;
    std::chrono::steady_clock::time_point created;
    unsigned leases = 0;
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
};
Engine &engine();
void wipe(Bytes &value);
#ifdef FFB_KEY_CRYPTO_TEST
Json testAes(const Json &request);
#endif
} // namespace ffb
