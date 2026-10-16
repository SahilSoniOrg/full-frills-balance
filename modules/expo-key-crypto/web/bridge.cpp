// WebAssembly bridge for Emscripten. Links the same Engine as mobile; Vault I/O via JS imports.
// Built by scripts/build-wasm-key-crypto.mjs (not compiled in the Android/iOS targets).

#include "KeyCrypto.hpp"
#include "RowCodec.hpp"
#include <cstdlib>
#include <cstring>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/val.h>

EM_ASYNC_JS(int, ffb_vault_load_async, (const char *namePtr), {
  const name = UTF8ToString(namePtr);
  try {
    const bytes = await Module.ffbVault.load(name);
    if (!bytes || bytes.length === 0) {
      Module.ffbVaultLastSize = 0;
      return 0;
    }
    const ptr = _malloc(bytes.length);
    HEAPU8.set(bytes, ptr);
    Module.ffbVaultLastSize = bytes.length;
    return ptr;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'FFB_KEY_VAULT_UNAVAILABLE';
    throw new Error(code);
  }
});

EM_ASYNC_JS(void, ffb_vault_save_async, (const char *namePtr, const char *dataPtr, int len), {
  const name = UTF8ToString(namePtr);
  const bytes = HEAPU8.slice(dataPtr, dataPtr + len);
  try {
    await Module.ffbVault.save(name, bytes);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'FFB_KEY_VAULT_UNAVAILABLE';
    throw new Error(code);
  }
});

EM_ASYNC_JS(void, ffb_vault_remove_async, (const char *namePtr), {
  const name = UTF8ToString(namePtr);
  try {
    await Module.ffbVault.remove(name);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'FFB_KEY_VAULT_UNAVAILABLE';
    throw new Error(code);
  }
});
#endif

namespace {
using Json = ffb::Json;

class WebVault final : public ffb::Vault {
public:
  ffb::Bytes load(const std::string &name) override {
#ifdef __EMSCRIPTEN__
    const int pointer = ffb_vault_load_async(name.c_str());
    const int length = emscripten::val::module_property("ffbVaultLastSize").as<int>();
    if (length <= 0) return {};
    std::vector<unsigned char> value(static_cast<size_t>(length));
    std::memcpy(value.data(), reinterpret_cast<void *>(pointer), value.size());
    std::free(reinterpret_cast<void *>(pointer));
    return value;
#else
    throw ffb::OperationError(ffb::ErrorCode::VaultUnavailable, "Web vault not linked");
#endif
  }
  void save(const std::string &name, const ffb::Bytes &key) override {
#ifdef __EMSCRIPTEN__
    ffb_vault_save_async(name.c_str(), reinterpret_cast<const char *>(key.data()),
                         static_cast<int>(key.size()));
#else
    throw ffb::OperationError(ffb::ErrorCode::VaultUnavailable, "Web vault not linked");
#endif
  }
  void remove(const std::string &name) override {
#ifdef __EMSCRIPTEN__
    ffb_vault_remove_async(name.c_str());
#else
    throw ffb::OperationError(ffb::ErrorCode::VaultUnavailable, "Web vault not linked");
#endif
  }
};

ffb::Engine &engine() {
  static ffb::Engine instance;
  return instance;
}

std::string executeJson(const std::string &operation, const std::string &requestJson) {
  WebVault vault;
  Json request = Json::parse(requestJson);
  if (operation == "test.rowCodec")
    return ffb::rows::testRowCodec(request).dump();
  Json result = engine().execute(operation, request, vault);
  return result.dump();
}
} // namespace

extern "C" char *ffb_key_crypto_execute(const char *operation, const char *requestJson) {
  try {
    const auto result = executeJson(operation ? operation : "", requestJson ? requestJson : "{}");
    auto *output = static_cast<char *>(std::malloc(result.size() + 1));
    if (!output) return nullptr;
    std::memcpy(output, result.c_str(), result.size() + 1);
    return output;
  } catch (...) {
    const auto result = Json{{"error", ffb::safeErrorCode()}}.dump();
    auto *output = static_cast<char *>(std::malloc(result.size() + 1));
    if (!output) return nullptr;
    std::memcpy(output, result.c_str(), result.size() + 1);
    return output;
  }
}

extern "C" void ffb_key_crypto_set_allowed(int allowed) {
  engine().setAllowed(allowed != 0);
}
