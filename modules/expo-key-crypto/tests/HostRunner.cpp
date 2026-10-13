#include "KeyCrypto.hpp"
#include <fstream>
#include <iostream>
#include <map>
#include <stdexcept>
using namespace ffb;
// Disposable native test process. Never compiled into either application.
class TestVault final : public Vault {
  std::map<std::string, Bytes> keys_;

public:
  ~TestVault() {
    for (auto &item : keys_)
      wipe(item.second);
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
};
int main() {
  TestVault vault;
  engine().setAllowed(true);
  std::string line;
  while (std::getline(std::cin, line)) {
    try {
      auto call = Json::parse(line);
      auto operation = call.at("operation").get<std::string>();
      auto input = call.at("request");
      Json result;
      if (operation == "test.setAllowed") {
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
      } else if (operation == "test.provisionDevice") {
        auto name = input.at("name").get<std::string>();
        auto encoded = input.at("key").get<std::string>();
        Bytes key(32);
        for (size_t i = 0; i < 32; i++)
          key[i] = static_cast<unsigned char>(
              std::stoul(encoded.substr(2 * i, 2), nullptr, 16));
        vault.save(name, key);
        wipe(key);
        result = nullptr;
      } else
        result = engine().execute(operation, input, vault);
      std::cout << Json{{"result", result}}.dump() << std::endl;
    } catch (...) {
      std::cout << Json{{"error", "Native test operation rejected"}}.dump()
                << std::endl;
    }
  }
}
