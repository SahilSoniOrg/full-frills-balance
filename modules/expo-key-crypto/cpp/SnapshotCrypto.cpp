#include "SnapshotCrypto.hpp"
#include <limits>

namespace ffb::detail {
namespace {
// Validate the entire JSON syntax but retain only the two authenticated header
// fields. Memory depends on nesting/token size, not the number of source
// records.
class SnapshotHeader final : public nlohmann::json_sax<Json> {
  enum class Target { None, Workplace, Id, Schema };
  struct Frame {
    bool object;
    bool workplace;
    Target pending = Target::None;
  };
  std::vector<Frame> frames_;
  bool started_ = false, workplaceSeen_ = false, idSeen_ = false,
       schemaSeen_ = false;
  bool scalar() {
    if (frames_.empty() || frames_.back().pending != Target::None)
      return false;
    return true;
  }
  bool start(bool object) {
    if (frames_.size() >= 64)
      return false;
    bool workplace = false;
    if (frames_.empty()) {
      if (started_ || !object)
        return false;
      started_ = true;
    } else {
      auto &parent = frames_.back();
      if (parent.pending == Target::Workplace) {
        if (!object || workplaceSeen_)
          return false;
        workplaceSeen_ = true;
        workplace = true;
      } else if (parent.pending != Target::None)
        return false;
      parent.pending = Target::None;
    }
    frames_.push_back({object, workplace});
    return true;
  }
  bool end(bool object) {
    if (frames_.empty() || frames_.back().object != object)
      return false;
    if (frames_.back().workplace && !idSeen_)
      return false;
    frames_.pop_back();
    return !frames_.empty() || (workplaceSeen_ && idSeen_ && schemaSeen_);
  }

public:
  std::string workplaceId;
  std::uint64_t schemaVersion = 0;
  bool null() override { return scalar(); }
  bool boolean(bool) override { return scalar(); }
  bool number_integer(number_integer_t value) override {
    if (!frames_.empty() && frames_.back().pending == Target::Schema) {
      if (value <= 0)
        return false;
      return number_unsigned(static_cast<number_unsigned_t>(value));
    }
    return scalar();
  }
  bool number_unsigned(number_unsigned_t value) override {
    if (!frames_.empty() && frames_.back().pending == Target::Schema) {
      if (schemaSeen_ || value == 0 || value > std::numeric_limits<int>::max())
        return false;
      schemaSeen_ = true;
      schemaVersion = value;
      frames_.back().pending = Target::None;
      return true;
    }
    return scalar();
  }
  bool number_float(number_float_t, const string_t &) override {
    return scalar();
  }
  bool string(string_t &value) override {
    if (!frames_.empty() && frames_.back().pending == Target::Id) {
      if (idSeen_ || value.empty() || value.size() > 128)
        return false;
      idSeen_ = true;
      workplaceId = value;
      frames_.back().pending = Target::None;
      return true;
    }
    return scalar();
  }
  bool binary(binary_t &) override { return false; }
  bool start_object(std::size_t) override { return start(true); }
  bool start_array(std::size_t) override { return start(false); }
  bool end_object() override { return end(true); }
  bool end_array() override { return end(false); }
  bool key(string_t &value) override {
    auto &frame = frames_.back();
    if (frames_.size() == 1 && value == "workplace")
      frame.pending = Target::Workplace;
    else if (frames_.size() == 1 && value == "schemaVersion")
      frame.pending = Target::Schema;
    else if (frame.workplace && value == "id")
      frame.pending = Target::Id;
    else
      frame.pending = Target::None;
    return true;
  }
  bool parse_error(std::size_t, const std::string &,
                   const Json::exception &) override {
    return false;
  }
};
SnapshotHeader header(const std::string &source) {
  require(source.size() <= MAX_SNAPSHOT, "Snapshot is too large");
  SnapshotHeader result;
  require(Json::sax_parse(source, &result),
          "Invalid snapshot header or syntax");
  return result;
}
Bytes snapshotAad(const Json &value) {
  return bytes(Json::array({value.at("format"), value.at("formatVersion"),
                            value.at("algorithm"), value.at("workplaceId"),
                            value.at("snapshotId"), value.at("schemaVersion"),
                            value.at("keyId"), "snapshot"})
                   .dump());
}
} // namespace

Json encryptSnapshot(const std::string &source, const Bytes &dek,
                     const Json &keys) {
  auto snapshot = header(source);
  require(snapshot.workplaceId == field(keys, "workplaceId"),
          "Snapshot Workplace mismatch");
  Json envelope = {{"format", "full-frills-encrypted-snapshot"},
                   {"formatVersion", 1},
                   {"algorithm", "AES-256-GCM"},
                   {"workplaceId", keys.at("workplaceId")},
                   {"snapshotId", hex(random(16))},
                   {"schemaVersion", snapshot.schemaVersion},
                   {"keyId", keys.at("keyId")}};
  auto nonce = random(12);
  envelope["nonce"] = hex(nonce);
  const std::span<const unsigned char> plaintext(
      reinterpret_cast<const unsigned char *>(source.data()), source.size());
  envelope["ciphertext"] =
      b64(aes(dek, nonce, snapshotAad(envelope), plaintext, true));
  return envelope;
}

std::string decryptSnapshot(const Json &envelope, const Bytes &dek,
                            const std::string &workplace) {
  fields(envelope,
         {"format", "formatVersion", "algorithm", "workplaceId", "snapshotId",
          "schemaVersion", "keyId", "nonce", "ciphertext"});
  require(envelope.at("format") == "full-frills-encrypted-snapshot" &&
              envelope.at("formatVersion") == 1 &&
              envelope.at("algorithm") == "AES-256-GCM" &&
              field(envelope, "workplaceId") == workplace &&
              fingerprint(dek) == field(envelope, "keyId"),
          "Encrypted snapshot identity mismatch");
  unhex(field(envelope, "snapshotId"), 16);
  Secret plaintext(
      aes(dek, unhex(field(envelope, "nonce"), 12), snapshotAad(envelope),
          unb64(field(envelope, "ciphertext"), MAX_SNAPSHOT + 16), false));
  auto result = text(plaintext.bytes);
  auto snapshot = header(result);
  require(snapshot.workplaceId == field(envelope, "workplaceId") &&
              snapshot.schemaVersion == envelope.at("schemaVersion"),
          "Encrypted snapshot identity mismatch");
  return result;
}
} // namespace ffb::detail
