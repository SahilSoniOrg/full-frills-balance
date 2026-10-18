#include "RowCompression.hpp"
#include "CryptoPrimitives.hpp"
#include <zlib.h>

namespace ffb::rows {
namespace {
using namespace ffb::detail;
constexpr int GZIP_WINDOW_BITS = 15 + 16;

struct GzipEncoder {
  z_stream stream{};
  GzipEncoder() {
    require(deflateInit2(&stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED,
                         GZIP_WINDOW_BITS, 8, Z_DEFAULT_STRATEGY) == Z_OK,
            "Gzip encoder unavailable", ErrorCode::OperationFailed);
  }
  ~GzipEncoder() { deflateEnd(&stream); }
};
struct GzipDecoder {
  z_stream stream{};
  GzipDecoder() {
    require(inflateInit2(&stream, GZIP_WINDOW_BITS) == Z_OK,
            "Gzip decoder unavailable", ErrorCode::OperationFailed);
  }
  ~GzipDecoder() { inflateEnd(&stream); }
};
} // namespace

void requireRowCompression(const std::string &compression) {
  if (compression != ROW_COMPRESSION)
    throw OperationError(ErrorCode::RowUnsupportedCompression,
                         "Unsupported row compression");
}

Bytes compressRow(const std::string &plaintext, const std::string &compression) {
  requireRowCompression(compression);
  require(plaintext.size() <= MAX_ROW_PLAINTEXT, "Row plaintext exceeds limit",
          ErrorCode::RowTooLarge);
  GzipEncoder encoder;
  Secret output(Bytes(deflateBound(&encoder.stream, plaintext.size())));
  encoder.stream.next_in = reinterpret_cast<Bytef *>(const_cast<char *>(plaintext.data()));
  encoder.stream.avail_in = static_cast<uInt>(plaintext.size());
  encoder.stream.next_out = output.bytes.data();
  encoder.stream.avail_out = static_cast<uInt>(output.bytes.size());
  require(deflate(&encoder.stream, Z_FINISH) == Z_STREAM_END &&
              encoder.stream.avail_in == 0,
          "Row gzip compression failed", ErrorCode::OperationFailed);
  output.bytes.resize(encoder.stream.total_out);
  return std::move(output.bytes);
}

Bytes decompressRow(const Bytes &body, const std::string &compression) {
  requireRowCompression(compression);
  require(!body.empty(), "Missing gzip row", ErrorCode::RowIntegrity);
  GzipDecoder decoder;
  // One overflow byte distinguishes an exactly-full row from oversized output.
  // Never size an allocation from the untrusted gzip trailer.
  Secret output(Bytes(MAX_ROW_PLAINTEXT + 1));
  decoder.stream.next_in = const_cast<Bytef *>(body.data());
  decoder.stream.avail_in = static_cast<uInt>(body.size());
  decoder.stream.next_out = output.bytes.data();
  decoder.stream.avail_out = static_cast<uInt>(output.bytes.size());
  const auto result = inflate(&decoder.stream, Z_FINISH);
  require(decoder.stream.total_out <= MAX_ROW_PLAINTEXT,
          "Decompressed row exceeds limit", ErrorCode::RowTooLarge);
  // Exactly one gzip member: reject truncation, corruption and trailing members/bytes.
  require(result == Z_STREAM_END && decoder.stream.avail_in == 0,
          "Invalid or trailing gzip row", ErrorCode::RowIntegrity);
  output.bytes.resize(decoder.stream.total_out);
  return std::move(output.bytes);
}
} // namespace ffb::rows
