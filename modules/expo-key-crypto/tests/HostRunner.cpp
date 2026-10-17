#include "KeyCrypto.hpp"
#include "RowCodec.hpp"
#include <fstream>
#include <iostream>
#include <map>
#include <openssl/evp.h>
#include <stdexcept>
using namespace ffb;
// Disposable native test process. Never compiled into either application.
class TestVault final : public Vault {
  std::map<std::string, Bytes> keys_;

public:
  ~TestVault() { clear(); }
  void clear() { for (auto &item : keys_) wipe(item.second); keys_.clear(); }
  Json metadata() {
    Json result = Json::object();
    for (auto &item : keys_) {
      unsigned char digest[32]; unsigned int length = 0;
      EVP_Digest(item.second.data(), item.second.size(), digest, &length, EVP_sha256(), nullptr);
      static constexpr char digits[] = "0123456789abcdef";
      std::string tag;
      for (auto value : digest) { tag += digits[value >> 4]; tag += digits[value & 15]; }
      result[item.first] = tag;
    }
    return result;
  }
  Bytes load(const std::string &name) override {
    auto found = keys_.find(name);
    return found == keys_.end() ? Bytes{} : found->second;
  }
  void save(const std::string &name, const Bytes &value) override {
    if (keys_.count(name))
      throw std::runtime_error("Device replacement refused");
    keys_[name] = value;
  }
  void remove(const std::string &name) override {
    auto found = keys_.find(name);
    if (found != keys_.end()) {
      wipe(found->second);
      keys_.erase(found);
    }
  }
  void clear() override { for (auto &item : keys_) wipe(item.second); keys_.clear(); }
};
int main() {
  std::map<std::string, TestVault> vaults;
  engine().setAllowed(true);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::string vaultId = "default";
    try {
      auto call = Json::parse(line);
      vaultId = call.value("vaultId", std::string("default"));
      auto &vault = vaults[vaultId];
      auto operation = call.at("operation").get<std::string>();
      auto input = call.at("request");
      Json result;
      if (operation == "test.rowCodec") {
        try { result = rows::testRowCodec(input); }
        catch (const std::exception &error) {
          result = Json{{"ok", false}, {"fixtureError", error.what()}};
        }
      } else if (operation == "test.aes") {
        result = testAes(input);
      } else if (operation == "test.clearDeviceVault") {
        vault.clear(); result = nullptr;
      } else if (operation == "test.setAllowed") {
        engine().setAllowed(input.at("allowed"));
        result = nullptr;
      } else if (operation == "test.importCredential") {
        auto data = input.at("credential").dump();
        Bytes value(data.begin(), data.end());
        result = engine().importCredential(value);
        wipe(value);
      } else if (operation == "test.exportCredential") {
        engine().retainCredential(input);
        auto value = engine().credentialFile(input);
        result = Json::parse(value.begin(), value.end());
        wipe(value);
        engine().releaseCredential(input);
      } else
        result = engine().execute(operation, input, vault);
      std::cout << Json{{"result", result}, {"devices", vault.metadata()}}.dump() << std::endl;
    } catch (...) {
      std::cout << Json{{"error", safeErrorCode()}, {"devices", vaults[vaultId].metadata()}}.dump()
                << std::endl;
    }
  }
}
