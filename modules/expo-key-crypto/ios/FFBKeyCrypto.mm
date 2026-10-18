#import "FFBKeyCrypto.h"
#include "KeyCrypto.hpp"
#import <Security/Security.h>
#include <stdexcept>
using namespace ffb;
namespace {
NSString *const nativeService = @"full-frills-native-key-crypto-v1";
NSMutableDictionary *query(const std::string &name, NSString *service) {
  NSData *key = [[NSString stringWithUTF8String:name.c_str()]
      dataUsingEncoding:NSUTF8StringEncoding];
  return [@{
    (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService : service,
    (__bridge id)kSecAttrAccount : key,
    (__bridge id)kSecAttrGeneric : key
  } mutableCopy];
}
NSData *read(const std::string &name, NSString *service) {
  auto q = query(name, service);
  q[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  q[(__bridge id)kSecReturnData] = @YES;
  CFTypeRef item = nullptr;
  OSStatus result = SecItemCopyMatching((__bridge CFDictionaryRef)q, &item);
  if (result == errSecItemNotFound)
    return nil;
  if (result == errSecInteractionNotAllowed || result == errSecNotAvailable)
    throw OperationError(ErrorCode::VaultUnavailable, "Native Device vault is temporarily unavailable");
  if (result != errSecSuccess)
    throw OperationError(ErrorCode::OperationFailed, "Native Device vault lookup failed");
  return CFBridgingRelease(item);
}
void store(const std::string &name, const Bytes &key) {
  auto q = query(name, nativeService);
  NSMutableData *value = [NSMutableData dataWithLength:key.size() + 1];
  auto *p = static_cast<unsigned char *>(value.mutableBytes);
  p[0] = 0xff;
  std::copy(key.begin(), key.end(), p + 1);
  q[(__bridge id)kSecValueData] = value;
  q[(__bridge id)kSecAttrAccessible] =
      (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
  OSStatus result = SecItemAdd((__bridge CFDictionaryRef)q, nullptr);
  [value resetBytesInRange:NSMakeRange(0, value.length)];
  if (result != errSecSuccess)
    throw std::runtime_error("Native Device vault write failed");
}
class AppleVault final : public Vault {
public:
  Bytes load(const std::string &name) override {
    NSData *value = read(name, nativeService);
    if (value) {
      if (value.length != 33 ||
          static_cast<const unsigned char *>(value.bytes)[0] != 0xff)
        throw OperationError(ErrorCode::RecoveryRequired, "Invalid native Device key");
      auto *p = static_cast<const unsigned char *>(value.bytes);
      return Bytes(p + 1, p + 33);
    }
    return {};
  }
  void save(const std::string &name, const Bytes &key) override {
    auto current = load(name);
    if (!current.empty()) {
      bool same = current == key;
      wipe(current);
      if (!same)
        throw std::runtime_error("Device key replacement is forbidden");
      return;
    }
    store(name, key);
    auto checked = load(name);
    bool same = checked == key;
    wipe(checked);
    if (!same)
      throw std::runtime_error("Device key readback failed");
  }
  void remove(const std::string &name) override {
    OSStatus status =
        SecItemDelete((__bridge CFDictionaryRef)query(name, nativeService));
    if (status != errSecSuccess && status != errSecItemNotFound)
      throw std::runtime_error("Device key removal failed");
  }
  void clear() override {
    NSDictionary *q = @{
      (__bridge id)kSecClass : (__bridge id)kSecClassGenericPassword,
      (__bridge id)kSecAttrService : nativeService
    };
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)q);
    if (status != errSecSuccess && status != errSecItemNotFound)
      throw std::runtime_error("Native Device key removal failed");
  }
};
Json parse(NSString *input) {
  NSData *data = [input dataUsingEncoding:NSUTF8StringEncoding];
  if (data.length > 52 * 1024 * 1024)
    throw std::runtime_error("Oversized native key request");
  const auto *p = static_cast<const unsigned char *>(data.bytes);
  return Json::parse(p, p + data.length);
}
NSString *output(const Json &value) {
  auto result = value.dump();
  return [[NSString alloc] initWithBytes:result.data()
                                  length:result.size()
                                encoding:NSUTF8StringEncoding];
}
void fail(NSError **error) {
  if (error)
    *error = [NSError
        errorWithDomain:@"FFBKeyCrypto"
                   code:1
               userInfo:@{
                 NSLocalizedDescriptionKey : [NSString stringWithUTF8String:safeErrorCode()]
               }];
}
} // namespace
@implementation FFBKeyCrypto
+ (void)setAllowed:(BOOL)allowed {
  engine().setAllowed(allowed);
}
+ (NSString *)executeOperation:(NSString *)operation
                       request:(NSString *)request
                         error:(NSError **)error {
  try {
    const std::string name = operation.UTF8String;
    if (name == "importCredential" || name == "exportCredential" ||
        name == "retainCredential" || name == "releaseCredential" ||
        name == "clearCredentials")
      throw OperationError(ErrorCode::InvalidFile,
                           "Unsupported native key operation");
    AppleVault vault;
    return output(
        engine().execute(name, parse(request), vault));
  } catch (...) {
    fail(error);
    return nil;
  }
}
+ (NSString *)importCredential:(NSString *)uri error:(NSError **)error {
  try {
    NSURL *url = [NSURL URLWithString:uri];
    if (!url.isFileURL)
      throw std::runtime_error("Invalid recovery file URI");
    NSFileHandle *handle = [NSFileHandle fileHandleForReadingFromURL:url
                                                               error:nil];
    if (!handle)
      throw std::runtime_error("Recovery file is unavailable");
    NSData *data = [handle readDataUpToLength:4097 error:nil];
    [handle closeFile];
    if (data.length > 4096)
      throw std::runtime_error("Recovery file is too large");
    const auto *p = static_cast<const unsigned char *>(data.bytes);
    Bytes value(p, p + data.length);
    try {
      auto result = engine().importCredential(value);
      wipe(value);
      return output(result);
    } catch (...) {
      wipe(value);
      throw;
    }
  } catch (...) {
    fail(error);
    return nil;
  }
}
+ (NSMutableData *)credentialData:(NSString *)handle error:(NSError **)error {
  try {
    auto value = engine().credentialFile(parse(handle));
    NSMutableData *data = [NSMutableData dataWithBytes:value.data() length:value.size()];
    wipe(value);
    return data;
  } catch (...) { fail(error); return nil; }
}
+ (BOOL)writeCredential:(NSString *)handle
                    uri:(NSString *)uri
                  error:(NSError **)error {
  try {
    NSURL *url = [NSURL URLWithString:uri];
    if (!url.isFileURL)
      throw std::runtime_error("Invalid recovery file URI");
    auto value = engine().credentialFile(parse(handle));
    NSMutableData *data = [NSMutableData dataWithBytes:value.data()
                                                length:value.size()];
    wipe(value);
    BOOL saved = [data writeToURL:url
                          options:NSDataWritingFileProtectionComplete
                            error:nil];
    [data resetBytesInRange:NSMakeRange(0, data.length)];
    if (!saved)
      throw std::runtime_error("Recovery export failed");
    return YES;
  } catch (...) {
    fail(error);
    return NO;
  }
}
+ (BOOL)retainCredential:(NSString *)handle error:(NSError **)error {
  try {
    engine().retainCredential(parse(handle));
    return YES;
  } catch (...) {
    fail(error);
    return NO;
  }
}
+ (BOOL)releaseCredential:(NSString *)handle error:(NSError **)error {
  try {
    engine().releaseCredential(parse(handle));
    return YES;
  } catch (...) {
    fail(error);
    return NO;
  }
}
+ (void)clearCredentials {
  engine().clearCredentials();
}
@end
