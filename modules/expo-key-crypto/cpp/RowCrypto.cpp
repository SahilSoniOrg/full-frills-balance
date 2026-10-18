#include "RowCrypto.hpp"
#include "CryptoPrimitives.hpp"
#include "ProtocolEnvelopes.hpp"
#include "RowCodec.hpp"
#include "RowCompression.hpp"
#include <openssl/kdf.h>
#include <algorithm>
#include <array>
#include <set>
#include <string_view>

namespace ffb::rows {
namespace {
using namespace ffb::detail;
constexpr std::size_t MAX_ROW_CIPHERTEXT = 68 * 1024;
constexpr std::size_t MAX_BATCH_ROWS = 500;
constexpr std::size_t MAX_BATCH_PLAINTEXT = 4 * 1024 * 1024;
constexpr std::size_t MAX_CIPHERTEXT_B64 = 4 * ((MAX_ROW_CIPHERTEXT + 2) / 3);
constexpr std::int64_t MAX_SAFE_INTEGER = 9007199254740991LL;
constexpr std::array<unsigned char, 12> NONCE{};

struct BatchFull {};

using PkeyCtx = std::unique_ptr<EVP_PKEY_CTX, decltype(&EVP_PKEY_CTX_free)>;

[[noreturn]] void invalid(const char *message) {
  throw OperationError(ErrorCode::InvalidFile, message);
}
void rowCheck(bool condition, const char *message) {
  if (!condition) invalid(message);
}
std::int64_t safeSignedInteger(const Json &value, const char *label) {
  rowCheck(value.is_number_integer(), label);
  if (value.is_number_unsigned()) {
    const auto number = value.get<std::uint64_t>();
    rowCheck(number <= static_cast<std::uint64_t>(MAX_SAFE_INTEGER), label);
    return static_cast<std::int64_t>(number);
  }
  const auto number = value.get<std::int64_t>();
  rowCheck(number >= -MAX_SAFE_INTEGER && number <= MAX_SAFE_INTEGER, label);
  return number;
}
std::string pairKey(const std::string &table, const std::string &rowId) {
  return std::to_string(table.size()) + ":" + table + rowId;
}
Bytes deriveRowKey(const Bytes &dek, const Bytes &salt, const Bytes &info) {
  Secret output(Bytes(32));
  PkeyCtx ctx(EVP_PKEY_CTX_new_id(EVP_PKEY_HKDF, nullptr), EVP_PKEY_CTX_free);
  require(!!ctx && EVP_PKEY_derive_init(ctx.get()) > 0 &&
              EVP_PKEY_CTX_set_hkdf_md(ctx.get(), EVP_sha256()) > 0 &&
              EVP_PKEY_CTX_set1_hkdf_salt(ctx.get(), salt.data(), salt.size()) > 0 &&
              EVP_PKEY_CTX_set1_hkdf_key(ctx.get(), dek.data(), dek.size()) > 0 &&
              EVP_PKEY_CTX_add1_hkdf_info(ctx.get(), info.data(), info.size()) > 0,
          "Native row key derivation setup failed", ErrorCode::OperationFailed);
  std::size_t size = output.bytes.size();
  require(EVP_PKEY_derive(ctx.get(), output.bytes.data(), &size) > 0 && size == 32,
          "Native row key derivation failed", ErrorCode::OperationFailed);
  return std::move(output.bytes);
}
Bytes crypt(EVP_CIPHER_CTX *ctx, const Bytes &key, const Bytes &aad,
            const Bytes &input, bool encrypt) {
  require(input.size() <= MAX_ROW_CIPHERTEXT,
          "Row ciphertext exceeds limit", ErrorCode::RowTooLarge);
  require(EVP_CIPHER_CTX_reset(ctx) == 1, "Native row cipher reset failed",
          ErrorCode::OperationFailed);
  Bytes output(input.size() + (encrypt ? 16 : 0));
  int written = 0, tail = 0, ignored = 0;
  if (encrypt) {
    require(EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1 &&
                EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, NONCE.size(), nullptr) == 1 &&
                EVP_EncryptInit_ex(ctx, nullptr, nullptr, key.data(), NONCE.data()) == 1 &&
                EVP_EncryptUpdate(ctx, nullptr, &ignored, aad.data(), static_cast<int>(aad.size())) == 1 &&
                EVP_EncryptUpdate(ctx, output.data(), &written, input.data(), static_cast<int>(input.size())) == 1 &&
                EVP_EncryptFinal_ex(ctx, output.data() + written, &tail) == 1,
            "Native row encryption failed", ErrorCode::OperationFailed);
    output.resize(static_cast<std::size_t>(written + tail + 16));
    require(EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16,
                                output.data() + written + tail) == 1,
            "Native row tag extraction failed", ErrorCode::OperationFailed);
  } else {
    if (input.size() < 16)
      throw OperationError(ErrorCode::RowIntegrity, "Invalid row ciphertext");
    output.resize(input.size() - 16);
    require(EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1 &&
                EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, NONCE.size(), nullptr) == 1 &&
                EVP_DecryptInit_ex(ctx, nullptr, nullptr, key.data(), NONCE.data()) == 1 &&
                EVP_DecryptUpdate(ctx, nullptr, &ignored, aad.data(), static_cast<int>(aad.size())) == 1 &&
                EVP_DecryptUpdate(ctx, output.data(), &written, input.data(), static_cast<int>(input.size() - 16)) == 1 &&
                EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16,
                                    const_cast<unsigned char *>(input.data() + input.size() - 16)) == 1,
            "Native row decryption failed", ErrorCode::OperationFailed);
    if (EVP_DecryptFinal_ex(ctx, output.data() + written, &tail) != 1) {
      wipe(output);
      throw OperationError(ErrorCode::RowIntegrity, "Row authentication failed");
    }
    output.resize(static_cast<std::size_t>(written + tail));
  }
  return output;
}
std::string rowError(const std::exception &error) {
  const auto *operation = dynamic_cast<const OperationError *>(&error);
  if (!operation) return "FFB_ROW_INTEGRITY";
  switch (operation->code) {
  case ErrorCode::RowUnsupportedCompression: return "FFB_ROW_UNSUPPORTED_COMPRESSION";
  case ErrorCode::RowTooLarge: return "FFB_ROW_TOO_LARGE";
  case ErrorCode::RowIntegrity:
  case ErrorCode::InvalidFile:
  case ErrorCode::AuthenticationFailed: return "FFB_ROW_INTEGRITY";
  default: return "FFB_ROW_INTEGRITY";
  }
}
RowHeader readEnvelope(const Json &value, const std::string &workplace,
                       const std::string &keyId, Bytes &ciphertext) {
  fields(value, {"format", "formatVersion", "enc", "compression", "workplaceId", "table",
                 "rowId", "updatedAt", "deleted", "keyId", "salt", "ciphertext"});
  rowCheck(value.size() == 12 && value.at("format") == ROW_FORMAT &&
            value.at("formatVersion") == ROW_FORMAT_VERSION && value.at("enc") == ROW_ENCODING,
        "Unsupported row envelope");
  requireRowCompression(field(value, "compression"));
  const auto &cipherText = field(value, "ciphertext");
  require(cipherText.size() <= MAX_CIPHERTEXT_B64,
          "Row ciphertext exceeds limit", ErrorCode::RowTooLarge);
  const auto &saltText = field(value, "salt");
  rowCheck(saltText.size() == 24, "Invalid row salt encoding");
  const auto &workplaceText = field(value, "workplaceId");
  const auto &tableText = field(value, "table");
  const auto &rowIdText = field(value, "rowId");
  const auto &keyIdText = field(value, "keyId");
  rowCheck(workplaceText.size() <= MAX_IDENTIFIER_UTF8_BYTES &&
            tableText.size() <= MAX_IDENTIFIER_UTF8_BYTES &&
            rowIdText.size() <= MAX_IDENTIFIER_UTF8_BYTES &&
            keyIdText.size() <= MAX_IDENTIFIER_UTF8_BYTES,
        "Oversized row envelope identifier");
  rowCheck(workplaceText == workplace && keyIdText == keyId,
        "Row scope mismatch");
  RowHeader header;
  header.compression = field(value, "compression");
  header.workplaceId = workplaceText;
  header.table = tableText;
  header.rowId = rowIdText;
  header.updatedAt = safeSignedInteger(value.at("updatedAt"), "Invalid row timestamp");
  rowCheck(value.at("deleted").is_boolean(), "Invalid deleted flag");
  header.deleted = value.at("deleted").get<bool>();
  header.keyId = keyIdText;
  header.salt = unb64(saltText, 16);
  rowCheck(header.salt.size() == 16, "Invalid row salt");
  ciphertext = unb64(cipherText, MAX_ROW_CIPHERTEXT);
  require(ciphertext.size() <= MAX_ROW_CIPHERTEXT,
          "Row ciphertext exceeds limit", ErrorCode::RowTooLarge);
  rowCheck(ciphertext.size() >= 16, "Missing row authentication tag");
  (void)encodeRowHeader(header);
  return header;
}
ManifestFields manifestFields(const Json &value) {
  fields(value, {"formatVersion", "workplaceId", "keyId", "id", "seq",
                 "prevHash", "authorUserId", "authorDeviceId", "rowCount",
                 "root", "createdAt"});
  rowCheck(value.size() == 11, "Invalid manifest fields");
  for (const auto *name : {"formatVersion", "seq", "rowCount", "createdAt"})
    rowCheck(value.at(name).is_number_integer(), "Invalid manifest number");
  for (const auto *name : {"workplaceId", "keyId", "id", "authorUserId", "authorDeviceId"}) {
    const auto &text = field(value, name);
    rowCheck(text.size() <= MAX_IDENTIFIER_UTF8_BYTES, "Oversized manifest identifier");
  }
  const auto &prev = field(value, "prevHash");
  const auto &root = field(value, "root");
  rowCheck(prev.size() == 64 && root.size() == 64, "Invalid manifest hash length");
  ManifestFields f{value.at("formatVersion").get<std::uint64_t>(),
      field(value,"workplaceId"), field(value,"keyId"), field(value,"id"),
      value.at("seq").get<std::uint64_t>(), unhex(prev,32),
      field(value,"authorUserId"), field(value,"authorDeviceId"),
      value.at("rowCount").get<std::uint64_t>(), unhex(root,32),
      safeSignedInteger(value.at("createdAt"), "Invalid manifest createdAt")};
  rowCheck(hex(f.prevHash) == prev && hex(f.root) == root,
        "Manifest hashes must be lowercase hexadecimal");
  rowCheck(f.formatVersion == 1, "Unsupported manifest version");
  return f;
}
} // namespace

Json encryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault) {
  fields(request, {"key", "workplaceId", "keyId", "rows"});
  rowCheck(request.size() == 4, "Invalid encryptRows request");
  const auto &workplace = field(request, "workplaceId");
  const auto &keyId = field(request, "keyId");
  rowCheck(keys.at("workplaceId") == workplace && keys.at("keyId") == keyId,
        "Workplace key reference scope mismatch");
  const auto &rows = request.at("rows");
  rowCheck(rows.is_array(), "Invalid row batch");
  require(rows.size() <= MAX_BATCH_ROWS, "Row batch exceeds limit",
          ErrorCode::RowTooLarge);
  std::size_t total = 0;
  std::set<std::string> seen;
  for (const auto &row : rows) {
    rowCheck(row.is_object() && row.size() == 7, "Invalid row request");
    fields(row, {"table", "rowId", "updatedAt", "deleted", "schemaVersion",
                 "compression", "plaintext"});
    const auto &plain = field(row, "plaintext");
    const auto &tableName = field(row, "table");
    const auto &rowName = field(row, "rowId");
    requireRowCompression(field(row, "compression"));
    rowCheck(tableName.size() <= MAX_IDENTIFIER_UTF8_BYTES &&
              rowName.size() <= MAX_IDENTIFIER_UTF8_BYTES,
          "Oversized row request identifier");
    require(plain.size() <= MAX_ROW_PLAINTEXT,
            "Row plaintext exceeds limit", ErrorCode::RowTooLarge);
    require(plain.size() <= MAX_BATCH_PLAINTEXT - total,
            "Row batch plaintext exceeds limit", ErrorCode::RowTooLarge);
    total += plain.size();
    rowCheck(seen.insert(pairKey(tableName,rowName)).second, "Duplicate row in batch");
  }
  rowCheck(user.at("recoveryConfirmed") == true && keys.at("recoveryConfirmed") == true,
        "Confirm recovery before encrypting rows");
  Secret dek(memberKey(user, keys, vault));
  require(dek.bytes.size() == 32, "Invalid Workplace DEK");
  Cipher c(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
  require(!!c, "Native row context allocation failed",
          ErrorCode::OperationFailed);
  Json output = Json::array();
  for (const auto &row : rows) {
    SecretString plaintext{field(row,"plaintext")};
    const auto table = field(row,"table"), compression = field(row,"compression");
    (void)encodeUtf8(plaintext.value, "row plaintext");
    const bool deleted = row.at("deleted").is_boolean() && row.at("deleted").get<bool>();
    rowCheck(row.at("deleted").is_boolean(), "Invalid deleted flag");
    rowCheck(!deleted || plaintext.value.empty(), "Tombstones must have an empty plaintext");
    Secret body;
    if (!deleted) body.bytes = compressRow(plaintext.value, compression);
    Secret inner(encodeInnerPlaintext(row.at("schemaVersion").get<std::uint64_t>(), body.bytes));
    RowHeader header{workplace, table, field(row,"rowId"),
        safeSignedInteger(row.at("updatedAt"), "Invalid row timestamp"), deleted, keyId, random(16), compression};
    auto aad = encodeRowHeader(header);
    auto info = encodeRowInfo(table);
    Secret rowKey(deriveRowKey(dek.bytes, header.salt, info));
    auto ciphertext = crypt(c.get(), rowKey.bytes, aad, inner.bytes, true);
    require(ciphertext.size() <= MAX_ROW_CIPHERTEXT,
            "Row ciphertext exceeds limit", ErrorCode::RowTooLarge);
    output.push_back({{"format", ROW_FORMAT}, {"formatVersion", ROW_FORMAT_VERSION},
        {"enc", ROW_ENCODING}, {"compression", compression}, {"workplaceId", workplace}, {"table", table},
        {"rowId", header.rowId}, {"updatedAt", header.updatedAt},
        {"deleted", deleted}, {"keyId", keyId}, {"salt", b64(header.salt)},
        {"ciphertext", b64(ciphertext)}});
    wipe(ciphertext);
  }
  return {{"envelopes", std::move(output)}};
}

Json decryptRows(const Json &request, const Json &user, const Json &keys,
                 Vault &vault) {
  rowCheck(user.at("recoveryConfirmed") == true && keys.at("recoveryConfirmed") == true,
        "Confirm recovery before decrypting rows");
  Secret dek(memberKey(user, keys, vault));
  return decryptRowsWithDek(request, keys, dek.bytes);
}

Json decryptRowsWithDek(const Json &request, const Json &keys, const Bytes &dek) {
  fields(request, {"key", "workplaceId", "envelopes"});
  rowCheck(request.size() == 3, "Invalid decryptRows request");
  const auto workplace = field(request,"workplaceId");
  rowCheck(keys.at("workplaceId") == workplace, "Workplace key reference scope mismatch");
  const auto &envelopes = request.at("envelopes");
  rowCheck(envelopes.is_array(), "Invalid row batch");
  require(envelopes.size() <= MAX_BATCH_ROWS, "Row batch exceeds limit",
          ErrorCode::RowTooLarge);
  // Bound attacker-controlled base64 and identify duplicates before allocating decoded buffers.
  std::set<std::string> seen;
  for (const auto &item : envelopes) {
    rowCheck(item.is_object() && item.contains("ciphertext") && item.at("ciphertext").is_string(),
          "Invalid row envelope");
    const auto size = item.at("ciphertext").get_ref<const std::string &>().size();
    require(size <= MAX_CIPHERTEXT_B64, "Row ciphertext exceeds limit", ErrorCode::RowTooLarge);
    for (const auto *name : {"workplaceId", "table", "rowId", "keyId", "salt"}) {
      if (!item.contains(name) || !item.at(name).is_string()) continue;
      const auto &text = item.at(name).get_ref<const std::string &>();
      const std::size_t cap = std::string_view(name) == "salt" ? 24 : MAX_IDENTIFIER_UTF8_BYTES;
      rowCheck(text.size() <= cap, "Oversized row envelope field");
    }
    if (item.contains("table") && item.at("table").is_string() &&
        item.contains("rowId") && item.at("rowId").is_string())
      rowCheck(seen.insert(pairKey(item.at("table").get<std::string>(),
                                item.at("rowId").get<std::string>())).second,
            "Duplicate row in batch");
  }
  require(dek.size() == 32, "Invalid Workplace DEK");
  Cipher c(EVP_CIPHER_CTX_new(), EVP_CIPHER_CTX_free);
  require(!!c, "Native row context allocation failed", ErrorCode::OperationFailed);
  Json output = Json::array();
  std::size_t totalPlaintext = 0;
  for (const auto &item : envelopes) {
    std::string rowId, table;
    if (item.is_object()) {
      if (item.contains("rowId") && item.at("rowId").is_string() &&
          item.at("rowId").get_ref<const std::string &>().size() <= MAX_IDENTIFIER_UTF8_BYTES)
        rowId = item.at("rowId").get<std::string>();
      if (item.contains("table") && item.at("table").is_string() &&
          item.at("table").get_ref<const std::string &>().size() <= MAX_IDENTIFIER_UTF8_BYTES)
        table = item.at("table").get<std::string>();
    }
    try {
      Bytes ciphertext;
      auto header = readEnvelope(item, workplace, field(keys,"keyId"), ciphertext);
      table = header.table; rowId = header.rowId;
      // Authenticate the compression selector and ciphertext before decompressing.
      auto aad = encodeRowHeader(header), info = encodeRowInfo(header.table);
      Secret rowKey(deriveRowKey(dek, header.salt, info));
      Secret innerBytes(crypt(c.get(), rowKey.bytes, aad, ciphertext, false));
      wipe(ciphertext);
      auto inner = decodeInnerPlaintext(innerBytes.bytes);
      Secret body(std::move(inner.body));
      Secret plain;
      if (header.deleted) {
        if (!body.bytes.empty())
          throw OperationError(ErrorCode::RowIntegrity, "Tombstone body must be empty");
      } else {
        plain.bytes = decompressRow(body.bytes, header.compression);
      }
      // A full batch returns the rows decrypted so far; the caller resubmits the rest.
      if (plain.bytes.size() > MAX_BATCH_PLAINTEXT - totalPlaintext) throw BatchFull{};
      totalPlaintext += plain.bytes.size();
      SecretString plaintext{decodeUtf8(plain.bytes, "row plaintext")};
      output.push_back({{"ok", true}, {"rowId", rowId}, {"table", table},
          {"schemaVersion", inner.schemaVersion}, {"compression", header.compression},
          {"plaintext", plaintext.value}});
    } catch (const BatchFull &) {
      break;
    } catch (const std::exception &error) {
      output.push_back({{"ok", false}, {"rowId", rowId}, {"table", table},
                        {"error", rowError(error)}});
    }
  }
  return {{"rows", std::move(output)}};
}

Json signRowManifest(const Json &request, const Json &user, Vault &vault) {
  fields(request, {"key", "fields"});
  rowCheck(request.size() == 2, "Invalid signRowManifest request");
  rowCheck(user.at("recoveryConfirmed") == true, "Confirm User recovery before signing");
  auto fieldsValue = manifestFields(request.at("fields"));
  rowCheck(fieldsValue.authorUserId == field(user,"userId"), "Manifest signer User mismatch");
  rowCheck(fieldsValue.authorDeviceId == field(user,"deviceId"), "Manifest signer Device mismatch");
  Secret bundle(userBundle(user, vault));
  auto secret = decodeBundle(bundle.bytes, user);
  auto encoded = encodeManifestBytes(fieldsValue);
  Digest ctx(EVP_MD_CTX_new(), EVP_MD_CTX_free);
  require(!!ctx && EVP_DigestSignInit(ctx.get(), nullptr, nullptr, nullptr,
                                     secret.signing.get()) == 1,
          "Native manifest signer setup failed", ErrorCode::OperationFailed);
  Bytes signature(64);
  std::size_t size = signature.size();
  require(EVP_DigestSign(ctx.get(), signature.data(), &size,
                        encoded.data(), encoded.size()) == 1 && size == 64,
          "Native manifest signing failed", ErrorCode::OperationFailed);
  signature.resize(size);
  return {{"signature", hex(signature)}};
}
} // namespace ffb::rows
