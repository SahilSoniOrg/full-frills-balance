#pragma once
#include "KeyCrypto.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace ffb::rows {
inline constexpr std::size_t MAX_IDENTIFIER_UTF8_BYTES = 128;
inline constexpr const char *ROW_FORMAT = "full-frills-encrypted-row";
inline constexpr const char *ROW_ENCODING = "shortkey1";
inline constexpr unsigned char ROW_FORMAT_VERSION = 1;
inline constexpr const char *ROW_INFO_DOMAIN = "FFB-ROW/1";
inline constexpr const char *MANIFEST_DOMAIN = "FFB-MANIFEST/1";

struct RowHeader {
  std::string workplaceId;
  std::string table;
  std::string rowId;
  std::int64_t updatedAt = 0;
  bool deleted = false;
  std::string keyId;
  Bytes salt;
  std::string compression;
};
struct InnerPlaintext {
  std::uint64_t schemaVersion = 0;
  Bytes body;
};
struct ManifestFields {
  std::uint64_t formatVersion = 0;
  std::string workplaceId;
  std::string keyId;
  std::string id;
  std::uint64_t seq = 0;
  Bytes prevHash;
  std::string authorUserId;
  std::string authorDeviceId;
  std::uint64_t rowCount = 0;
  Bytes root;
  std::int64_t createdAt = 0;
};

// Canonical TLV primitives shared by the Phase 2 codecs and future RowCrypto.
Bytes encodeUvarint(std::uint64_t value);
std::uint64_t decodeUvarint(const Bytes &bytes, std::size_t &offset);
Bytes encodeTlv(unsigned char version,
                const std::vector<std::pair<unsigned char, Bytes>> &fields);
std::vector<Bytes> decodeTlv(const Bytes &bytes, unsigned char version,
                             const std::vector<unsigned char> &requiredTags);
Bytes encodeUtf8(const std::string &value, const char *label = "string",
                 bool identifier = false);
std::string decodeUtf8(const Bytes &value, const char *label = "string");
Bytes encodeInt64Milliseconds(std::int64_t value);
std::int64_t decodeInt64Milliseconds(const Bytes &value);

Bytes encodeRowHeader(const RowHeader &header);
RowHeader decodeRowHeader(const Bytes &bytes);
Bytes encodeRowInfo(const std::string &table);
std::string decodeRowInfo(const Bytes &bytes);
Bytes encodeInnerPlaintext(std::uint64_t schemaVersion,
                           const Bytes &body);
InnerPlaintext decodeInnerPlaintext(const Bytes &bytes);
Bytes encodeManifestBytes(const ManifestFields &fields);
ManifestFields decodeManifestBytes(const Bytes &bytes);

#ifdef FFB_KEY_CRYPTO_TEST
// Host-only vector checker. This is not dispatched through the app bridge.
Json testRowCodec(const Json &request);
#endif
} // namespace ffb::rows
