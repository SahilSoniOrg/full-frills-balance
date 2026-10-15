#include "RowCodec.hpp"
#ifdef FFB_KEY_CRYPTO_TEST
#include "CryptoPrimitives.hpp"
#endif
#include <algorithm>
#include <array>
#include <limits>
#include <string_view>

namespace ffb::rows {
namespace {
constexpr std::uint64_t MAX_SAFE = 9007199254740991ULL;
constexpr std::int64_t MIN_SAFE_TIME = -9007199254740991LL;
constexpr std::int64_t MAX_SAFE_TIME = 9007199254740991LL;
constexpr std::array<std::string_view, 12> TABLES = {
    "accounts", "journals", "transactions", "audit_logs", "budgets",
    "budget_scopes", "account_metadata", "planned_payments",
    "journal_metadata", "transaction_auto_post_rules",
    "transaction_inbox_records", "workplace"};

void check(bool value, const char *message) {
  if (!value) throw std::runtime_error(message);
}
bool isTable(std::string_view table) {
  return std::find(TABLES.begin(), TABLES.end(), table) != TABLES.end();
}
Bytes raw(std::string_view value) {
  return Bytes(value.begin(), value.end());
}
void validateIdentifier(const std::string &value, const char *label) {
  (void)encodeUtf8(value, label, true);
}
Bytes numberField(std::uint64_t value) { return encodeUvarint(value); }
std::uint64_t readNumber(const Bytes &bytes) {
  std::size_t offset = 0;
  const auto value = decodeUvarint(bytes, offset);
  check(offset == bytes.size(), "Trailing uvarint bytes");
  return value;
}
#ifdef FFB_KEY_CRYPTO_TEST
Bytes jsonHex(const Json &object, const char *name, std::size_t count) {
  const auto &value = ffb::detail::field(object, name);
  check(value.size() == count * 2, "Invalid hex length");
  auto result = ffb::detail::unhex(value, count);
  check(ffb::detail::hex(result) == value, "Hex must be lowercase");
  return result;
}
RowHeader rowFromJson(const Json &row) {
  RowHeader result;
  result.workplaceId = ffb::detail::field(row, "workplaceId");
  result.table = ffb::detail::field(row, "table");
  result.rowId = ffb::detail::field(row, "rowId");
  check(row.contains("updatedAt") && row.at("updatedAt").is_number_integer(),
        "Invalid updatedAt");
  result.updatedAt = row.at("updatedAt").get<std::int64_t>();
  check(row.contains("deleted") && row.at("deleted").is_boolean(),
        "Invalid deleted flag");
  result.deleted = row.at("deleted").get<bool>();
  result.keyId = ffb::detail::field(row, "keyId");
  result.salt = ffb::detail::unb64(ffb::detail::field(row, "salt"), 16);
  check(result.salt.size() == 16, "salt must be 16 bytes");
  return result;
}
void assertBytesEqual(const Bytes &actual, const std::string &expectedHex,
                      const char *label) {
  check(ffb::detail::hex(actual) == expectedHex, label);
}
Bytes sha256(const Bytes &input) {
  Bytes output(32);
  unsigned int length = 0;
  check(EVP_Digest(input.data(), input.size(), output.data(), &length,
                   EVP_sha256(), nullptr) == 1 && length == 32,
        "SHA-256 failed");
  return output;
}
Bytes merkleRoot(const std::vector<Bytes> &leaves, std::size_t start,
                 std::size_t count) {
  if (count == 0) return sha256({});
  if (count == 1) {
    Bytes prefixed{0};
    prefixed.insert(prefixed.end(), leaves[start].begin(), leaves[start].end());
    return sha256(prefixed);
  }
  std::size_t split = 1;
  while ((split << 1) < count) split <<= 1;
  const auto left = merkleRoot(leaves, start, split);
  const auto right = merkleRoot(leaves, start + split, count - split);
  Bytes prefixed{1};
  prefixed.insert(prefixed.end(), left.begin(), left.end());
  prefixed.insert(prefixed.end(), right.begin(), right.end());
  return sha256(prefixed);
}
void reject(const Bytes &bytes) {
  bool failed = false;
  try { (void)decodeTlv(bytes, 1, {1, 2}); }
  catch (...) { failed = true; }
  check(failed, "Malformed TLV was accepted");
}
#endif // FFB_KEY_CRYPTO_TEST
} // namespace

Bytes encodeUvarint(std::uint64_t value) {
  check(value <= MAX_SAFE, "Uvarint exceeds safe integer range");
  Bytes output;
  do {
    unsigned char byte = static_cast<unsigned char>(value & 0x7f);
    value >>= 7;
    if (value) byte |= 0x80;
    output.push_back(byte);
  } while (value);
  return output;
}
std::uint64_t decodeUvarint(const Bytes &bytes, std::size_t &offset) {
  check(offset <= bytes.size(), "Invalid varint offset");
  std::uint64_t value = 0;
  unsigned shift = 0;
  const std::size_t start = offset;
  for (; offset < bytes.size() && offset - start < 8; ++offset) {
    const unsigned char byte = bytes[offset];
    value |= static_cast<std::uint64_t>(byte & 0x7f) << shift;
    if ((byte & 0x80) == 0) {
      ++offset;
      check(!(offset - start > 1 && byte == 0), "Nonminimal uvarint");
      check(value <= MAX_SAFE, "Uvarint exceeds safe integer range");
      return value;
    }
    shift += 7;
  }
  throw std::runtime_error("Truncated or overflowing uvarint");
}
Bytes encodeTlv(unsigned char version,
                const std::vector<std::pair<unsigned char, Bytes>> &fields) {
  Bytes output{version};
  unsigned previous = 0;
  for (const auto &field : fields) {
    check(field.first > previous, "TLV tags must be strictly increasing");
    previous = field.first;
    output.push_back(field.first);
    auto length = encodeUvarint(field.second.size());
    output.insert(output.end(), length.begin(), length.end());
    output.insert(output.end(), field.second.begin(), field.second.end());
  }
  return output;
}
std::vector<Bytes> decodeTlv(const Bytes &bytes, unsigned char version,
                             const std::vector<unsigned char> &requiredTags) {
  check(!bytes.empty() && bytes[0] == version, "Unexpected TLV version");
  std::vector<Bytes> values(requiredTags.size());
  std::size_t offset = 1;
  unsigned previous = 0;
  std::size_t index = 0;
  while (offset < bytes.size()) {
    const unsigned char tag = bytes[offset++];
    check(tag > previous, "Duplicate or out-of-order TLV tag");
    check(index < requiredTags.size() && tag == requiredTags[index],
          "Unknown, missing, or out-of-order TLV tag");
    previous = tag;
    ++index;
    const auto length = decodeUvarint(bytes, offset);
    check(length <= bytes.size() - offset, "Truncated TLV value");
    values[index - 1].assign(bytes.begin() + offset,
                             bytes.begin() + offset + static_cast<std::size_t>(length));
    offset += static_cast<std::size_t>(length);
  }
  check(offset == bytes.size() && index == requiredTags.size(),
        "Missing or trailing TLV fields");
  return values;
}
Bytes encodeUtf8(const std::string &value, const char *label, bool identifier) {
  const auto *p = reinterpret_cast<const unsigned char *>(value.data());
  const std::size_t size = value.size();
  for (std::size_t i = 0; i < size;) {
    const unsigned char c = p[i];
    std::size_t count = 0;
    std::uint32_t code = 0;
    if (c <= 0x7f) { count = 1; code = c; }
    else if (c >= 0xc2 && c <= 0xdf) { count = 2; code = c & 0x1f; }
    else if (c >= 0xe0 && c <= 0xef) { count = 3; code = c & 0x0f; }
    else if (c >= 0xf0 && c <= 0xf4) { count = 4; code = c & 0x07; }
    else throw std::runtime_error(std::string(label) + " is malformed UTF-8");
    check(i + count <= size, "Malformed UTF-8");
    for (std::size_t j = 1; j < count; ++j) {
      check((p[i + j] & 0xc0) == 0x80, "Malformed UTF-8");
      code = (code << 6) | (p[i + j] & 0x3f);
    }
    check((count != 2 || code >= 0x80) && (count != 3 || code >= 0x800) &&
              (count != 4 || code >= 0x10000) && code <= 0x10ffff &&
              !(code >= 0xd800 && code <= 0xdfff),
          "Malformed UTF-8");
    i += count;
  }
  check(!identifier || size <= 128, "Identifier exceeds 128 UTF-8 bytes");
  return Bytes(value.begin(), value.end());
}
std::string decodeUtf8(const Bytes &value, const char *label) {
  std::string result(value.begin(), value.end());
  try { (void)encodeUtf8(result, label, false); }
  catch (...) { throw std::runtime_error(std::string(label) + " is malformed UTF-8"); }
  return result; // Keep U+FEFF; UTF-8 BOM is ordinary data in this protocol.
}
Bytes encodeInt64Milliseconds(std::int64_t value) {
  check(value >= MIN_SAFE_TIME && value <= MAX_SAFE_TIME,
        "Timestamp exceeds safe integer range");
  const auto rawValue = static_cast<std::uint64_t>(value);
  Bytes output(8);
  for (unsigned i = 0; i < 8; ++i)
    output[i] = static_cast<unsigned char>(rawValue >> (56 - 8 * i));
  return output;
}
std::int64_t decodeInt64Milliseconds(const Bytes &value) {
  check(value.size() == 8, "Timestamp must be 8 bytes");
  std::uint64_t bits = 0;
  for (unsigned char byte : value) bits = (bits << 8) | byte;
  const std::int64_t signedValue = bits <= static_cast<std::uint64_t>(std::numeric_limits<std::int64_t>::max())
      ? static_cast<std::int64_t>(bits)
      : -1 - static_cast<std::int64_t>(~bits);
  check(signedValue >= MIN_SAFE_TIME && signedValue <= MAX_SAFE_TIME,
        "Timestamp exceeds safe integer range");
  return signedValue;
}

Bytes encodeRowHeader(const RowHeader &header) {
  check(isTable(header.table), "Unknown row table");
  validateIdentifier(header.workplaceId, "workplaceId");
  validateIdentifier(header.rowId, "rowId");
  validateIdentifier(header.keyId, "keyId");
  check(header.salt.size() == 16, "salt must be 16 bytes");
  return encodeTlv(1, {{1, raw(ROW_FORMAT)}, {2, Bytes{1}},
      {3, raw(ROW_ENCODING)}, {4, encodeUtf8(header.workplaceId, "workplaceId", true)},
      {5, encodeUtf8(header.table)}, {6, encodeUtf8(header.rowId, "rowId", true)},
      {7, encodeInt64Milliseconds(header.updatedAt)},
      {8, Bytes{static_cast<unsigned char>(header.deleted ? 1 : 0)}},
      {9, encodeUtf8(header.keyId, "keyId", true)}, {10, header.salt}});
}
RowHeader decodeRowHeader(const Bytes &bytes) {
  auto f = decodeTlv(bytes, 1, {1,2,3,4,5,6,7,8,9,10});
  check(decodeUtf8(f[0], "format") == ROW_FORMAT && f[1] == Bytes{1} &&
            decodeUtf8(f[2], "enc") == ROW_ENCODING,
        "Invalid row format");
  RowHeader result{decodeUtf8(f[3], "workplaceId"), decodeUtf8(f[4], "table"),
      decodeUtf8(f[5], "rowId"), decodeInt64Milliseconds(f[6]), false,
      decodeUtf8(f[8], "keyId"), f[9]};
  check(isTable(result.table), "Unknown row table");
  check(f[7].size() == 1 && f[7][0] <= 1, "Invalid deleted flag");
  result.deleted = f[7][0] != 0;
  validateIdentifier(result.workplaceId, "workplaceId");
  validateIdentifier(result.rowId, "rowId");
  validateIdentifier(result.keyId, "keyId");
  check(result.salt.size() == 16, "salt must be 16 bytes");
  check(encodeRowHeader(result) == bytes, "Noncanonical row header");
  return result;
}
Bytes encodeRowInfo(const std::string &table) {
  check(isTable(table), "Unknown row table");
  return encodeTlv(2, {{1, raw(ROW_INFO_DOMAIN)}, {2, encodeUtf8(table)}});
}
std::string decodeRowInfo(const Bytes &bytes) {
  auto f = decodeTlv(bytes, 2, {1,2});
  check(decodeUtf8(f[0], "info domain") == ROW_INFO_DOMAIN,
        "Invalid row info domain");
  auto table = decodeUtf8(f[1], "table");
  check(isTable(table), "Unknown row table");
  check(encodeRowInfo(table) == bytes, "Noncanonical row info");
  return table;
}
Bytes encodeInnerPlaintext(std::uint64_t schemaVersion,
                           const std::string &dictId, const Bytes &body) {
  check(schemaVersion <= MAX_SAFE, "schemaVersion exceeds safe integer range");
  auto dict = encodeUtf8(dictId, "dictId", true);
  return encodeTlv(4, {{1, numberField(schemaVersion)}, {2, dict}, {3, body}});
}
InnerPlaintext decodeInnerPlaintext(const Bytes &bytes) {
  auto f = decodeTlv(bytes, 4, {1,2,3});
  InnerPlaintext result{readNumber(f[0]), decodeUtf8(f[1], "dictId"), f[2]};
  validateIdentifier(result.dictId, "dictId");
  check(encodeInnerPlaintext(result.schemaVersion, result.dictId, result.body) == bytes,
        "Noncanonical inner TLV");
  return result;
}
Bytes encodeManifestBytes(const ManifestFields &fields) {
  check(fields.formatVersion <= MAX_SAFE && fields.seq <= MAX_SAFE &&
            fields.rowCount <= MAX_SAFE, "Manifest number exceeds safe integer range");
  check(fields.prevHash.size() == 32 && fields.root.size() == 32,
        "Manifest hashes must be 32 bytes");
  validateIdentifier(fields.workplaceId, "workplaceId");
  validateIdentifier(fields.keyId, "keyId");
  validateIdentifier(fields.id, "id");
  validateIdentifier(fields.authorUserId, "authorUserId");
  validateIdentifier(fields.authorDeviceId, "authorDeviceId");
  return encodeTlv(3, {{1, raw(MANIFEST_DOMAIN)}, {2, numberField(fields.formatVersion)},
      {3, encodeUtf8(fields.workplaceId, "workplaceId", true)},
      {4, encodeUtf8(fields.keyId, "keyId", true)},
      {5, encodeUtf8(fields.id, "id", true)}, {6, numberField(fields.seq)},
      {7, fields.prevHash}, {8, encodeUtf8(fields.authorUserId, "authorUserId", true)},
      {9, encodeUtf8(fields.authorDeviceId, "authorDeviceId", true)},
      {10, numberField(fields.rowCount)}, {11, fields.root},
      {12, encodeInt64Milliseconds(fields.createdAt)}});
}
ManifestFields decodeManifestBytes(const Bytes &bytes) {
  auto f = decodeTlv(bytes, 3, {1,2,3,4,5,6,7,8,9,10,11,12});
  check(decodeUtf8(f[0], "manifest domain") == MANIFEST_DOMAIN,
        "Invalid manifest domain");
  ManifestFields result{readNumber(f[1]), decodeUtf8(f[2], "workplaceId"),
      decodeUtf8(f[3], "keyId"), decodeUtf8(f[4], "id"), readNumber(f[5]),
      f[6], decodeUtf8(f[7], "authorUserId"), decodeUtf8(f[8], "authorDeviceId"),
      readNumber(f[9]), f[10], decodeInt64Milliseconds(f[11])};
  check(result.prevHash.size() == 32 && result.root.size() == 32,
        "Manifest hashes must be 32 bytes");
  validateIdentifier(result.workplaceId, "workplaceId");
  validateIdentifier(result.keyId, "keyId");
  validateIdentifier(result.id, "id");
  validateIdentifier(result.authorUserId, "authorUserId");
  validateIdentifier(result.authorDeviceId, "authorDeviceId");
  check(encodeManifestBytes(result) == bytes, "Noncanonical manifest TLV");
  return result;
}

#ifdef FFB_KEY_CRYPTO_TEST
Json testRowCodec(const Json &request) {
  check(request.is_object() && request.contains("vectors") && request.at("vectors").is_object(),
        "Missing row codec vectors");
  const auto &vectors = request.at("vectors");
  check(vectors.value("format", std::string()) == "ffb-row-vectors-v2",
        "Unsupported row vector format");
  const auto &tables = vectors.at("tables");
  check(tables.is_array() && tables.size() == TABLES.size(), "Unexpected row vector count");
  std::size_t rows = 0;
  for (const auto &row : tables) {
    RowHeader header = rowFromJson(row);
    const auto aad = encodeRowHeader(header);
    assertBytesEqual(aad, ffb::detail::field(row, "aadHex"), "AAD vector mismatch");
    auto decoded = decodeRowHeader(aad);
    check(decoded.workplaceId == header.workplaceId && decoded.table == header.table &&
              decoded.rowId == header.rowId && decoded.updatedAt == header.updatedAt &&
              decoded.deleted == header.deleted && decoded.keyId == header.keyId &&
              decoded.salt == header.salt, "Header decode mismatch");
    assertBytesEqual(encodeRowInfo(header.table), ffb::detail::field(row, "infoHex"),
                     "Row info vector mismatch");
    (void)decodeRowInfo(encodeRowInfo(header.table));
    const auto expectedInnerHex = ffb::detail::field(row, "innerTlvHex");
    auto expectedInner = ffb::detail::unhex(expectedInnerHex, expectedInnerHex.size()/2);
    const auto &codecBody = row.at("codecBody");
    const auto bodyHex = ffb::detail::field(codecBody, "hex");
    auto body = ffb::detail::unhex(bodyHex, bodyHex.size()/2);
    const auto innerBytes = encodeInnerPlaintext(1, header.table + "/v1", body);
    assertBytesEqual(innerBytes, expectedInnerHex, "Inner TLV vector mismatch");
    auto inner = decodeInnerPlaintext(expectedInner);
    check(inner.schemaVersion == 1 && inner.dictId == header.table + "/v1" &&
              inner.body == body, "Inner TLV decode mismatch");
    const auto ciphertext = ffb::detail::field(row, "ciphertextBase64");
    const auto ciphertextBytes = ffb::detail::unb64(ciphertext, 65552);
    check(ffb::detail::b64(ciphertextBytes) == ciphertext,
          "Noncanonical ciphertext base64");
    ++rows;
  }
  for (const auto &boundary : vectors.at("uvarintBoundaries")) {
    const auto value = boundary.at("value").get<std::uint64_t>();
    const auto encoded = encodeUvarint(value);
    assertBytesEqual(encoded, ffb::detail::field(boundary, "hex"),
                     "Uvarint boundary mismatch");
    std::size_t offset = 0;
    check(decodeUvarint(encoded, offset) == value && offset == encoded.size(),
          "Uvarint boundary decode mismatch");
  }
  const auto &edges = vectors.at("edgeCases");
  const auto &firstRow = tables.at(0);
  auto longest = rowFromJson(firstRow);
  longest.rowId = std::string(128, 'x');
  for (std::size_t i = 0; i < longest.salt.size(); ++i)
    longest.salt[i] = static_cast<unsigned char>(i);
  assertBytesEqual(encodeRowHeader(longest),
                   ffb::detail::field(edges, "maxIdentifierHeaderHex"),
                   "Maximum identifier header mismatch");
  const auto unicode = ffb::detail::field(edges, "unicodeIdentifier");
  check(encodeUtf8(unicode).size() == edges.at("unicodeIdentifierUtf8Bytes").get<std::size_t>(),
        "Unicode identifier byte count mismatch");

  const auto &manifest = vectors.at("manifest");
  ManifestFields m{manifest.at("formatVersion").get<std::uint64_t>(),
      ffb::detail::field(manifest, "workplaceId"), ffb::detail::field(manifest, "keyId"),
      ffb::detail::field(manifest, "id"), manifest.at("seq").get<std::uint64_t>(),
      jsonHex(manifest, "prevHash", 32), ffb::detail::field(manifest, "authorUserId"),
      ffb::detail::field(manifest, "authorDeviceId"),
      manifest.at("rowCount").get<std::uint64_t>(), jsonHex(manifest, "root", 32),
      manifest.at("createdAt").get<std::int64_t>()};
  const auto signedBytes = encodeManifestBytes(m);
  assertBytesEqual(signedBytes, ffb::detail::field(manifest, "signedBytesHex"),
                   "Manifest vector mismatch");
  assertBytesEqual(sha256(signedBytes), ffb::detail::field(manifest, "hashHex"),
                   "Manifest hash vector mismatch");
  (void)decodeManifestBytes(signedBytes);
  check(jsonHex(manifest, "signatureHex", 64).size() == 64,
        "Invalid manifest signature vector");
  // Independently check fixture Merkle vectors; production Merkle stays in JS.
  for (auto it = vectors.at("merkleCases").begin();
       it != vectors.at("merkleCases").end(); ++it) {
    std::vector<Bytes> leaves;
    for (const auto &leafHex : it.value().at("leavesHex")) {
      const auto value = leafHex.get<std::string>();
      leaves.push_back(ffb::detail::unhex(value, value.size()/2));
    }
    check(it.key() == std::to_string(leaves.size()), "Merkle case count mismatch");
    assertBytesEqual(merkleRoot(leaves, 0, leaves.size()),
                     ffb::detail::field(it.value(), "rootHex"),
                     "Merkle vector mismatch");
  }
  // Canonical decoder rejection cases are supplied by the interop test.
  check(request.contains("malformedTlvHex") && request.at("malformedTlvHex").is_array(),
        "Missing malformed TLV vectors");
  std::size_t malformedCount = 0;
  for (const auto &hex : request.at("malformedTlvHex")) {
    check(hex.is_string(), "Malformed TLV case must be hex");
    const auto value = hex.get<std::string>();
    const auto bad = ffb::detail::unhex(value, value.size()/2);
    reject(bad);
    ++malformedCount;
  }
  check(malformedCount >= 5, "Insufficient malformed TLV vectors");
  check(request.contains("malformedVarintHex") && request.at("malformedVarintHex").is_array(),
        "Missing malformed varint vectors");
  std::size_t malformedVarints = 0;
  for (const auto &hex : request.at("malformedVarintHex")) {
    const auto value = hex.get<std::string>();
    const auto bad = ffb::detail::unhex(value, value.size()/2);
    std::size_t offset = 0;
    bool failed = false;
    try { (void)decodeUvarint(bad, offset); } catch (...) { failed = true; }
    check(failed, "Malformed uvarint was accepted");
    ++malformedVarints;
  }
  check(malformedVarints >= 3, "Insufficient malformed varint vectors");
  bool badUtf8Rejected = false;
  try { (void)decodeUtf8(Bytes{0xff}); } catch (...) { badUtf8Rejected = true; }
  check(badUtf8Rejected, "Malformed UTF-8 was accepted");
  const std::string bom = "\xef\xbb\xbf";
  check(decodeUtf8(encodeUtf8(bom)) == bom, "UTF-8 BOM was not preserved");
  bool longIdRejected = false;
  try { (void)encodeUtf8(std::string(129, 'x'), "identifier", true); }
  catch (...) { longIdRejected = true; }
  check(longIdRejected, "Oversized identifier was accepted");
  bool unsafeVarintRejected = false;
  try { (void)encodeUvarint(MAX_SAFE + 1); } catch (...) { unsafeVarintRejected = true; }
  check(unsafeVarintRejected, "Unsafe uvarint was accepted");
  bool unsafeTimestampEncodeRejected = false;
  try { (void)encodeInt64Milliseconds(MAX_SAFE_TIME + 1); }
  catch (...) { unsafeTimestampEncodeRejected = true; }
  check(unsafeTimestampEncodeRejected, "Unsafe timestamp was encoded");
  bool unsafeTimestampDecodeRejected = false;
  try { (void)decodeInt64Milliseconds(Bytes{0,0x20,0,0,0,0,0,0}); }
  catch (...) { unsafeTimestampDecodeRejected = true; }
  check(unsafeTimestampDecodeRejected, "Unsafe timestamp was decoded");
  return Json{{"ok", true}, {"rows", rows}, {"manifest", true},
              {"malformedCases", malformedCount + malformedVarints + 5}};
}
#endif // FFB_KEY_CRYPTO_TEST
} // namespace ffb::rows
