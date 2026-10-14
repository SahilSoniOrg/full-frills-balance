#include "KeyCrypto.hpp"
#include <jni.h>
#include <stdexcept>
using namespace ffb;
namespace {
std::string utf8(JNIEnv *env, jstring value) {
  // JSON transport is ASCII-safe; avoid JNI modified UTF-8 changing
  // supplementary Unicode.
  jclass cls = env->FindClass("java/lang/String");
  jmethodID method =
      env->GetMethodID(cls, "getBytes", "(Ljava/lang/String;)[B");
  jstring charset = env->NewStringUTF("UTF-8");
  auto array =
      static_cast<jbyteArray>(env->CallObjectMethod(value, method, charset));
  auto count = env->GetArrayLength(array);
  std::string result(count, '\0');
  env->GetByteArrayRegion(array, 0, count,
                          reinterpret_cast<jbyte *>(result.data()));
  env->DeleteLocalRef(array);
  env->DeleteLocalRef(charset);
  env->DeleteLocalRef(cls);
  return result;
}
jstring output(JNIEnv *env, const std::string &text) {
  auto value = env->NewByteArray(text.size());
  env->SetByteArrayRegion(value, 0, text.size(),
                          reinterpret_cast<const jbyte *>(text.data()));
  auto cls = env->FindClass("java/lang/String");
  auto ctor = env->GetMethodID(cls, "<init>", "([BLjava/lang/String;)V");
  auto charset = env->NewStringUTF("UTF-8");
  auto result = static_cast<jstring>(env->NewObject(cls, ctor, value, charset));
  env->DeleteLocalRef(value);
  env->DeleteLocalRef(charset);
  env->DeleteLocalRef(cls);
  return result;
}
Json request(JNIEnv *env, jstring value) {
  auto encoded = utf8(env, value);
  if (encoded.size() > 52 * 1024 * 1024)
    throw std::runtime_error("Oversized native key request");
  return Json::parse(encoded);
}
void fail(JNIEnv *env) {
  env->ThrowNew(
      env->FindClass("java/lang/IllegalStateException"),
      safeErrorCode());
}
class AndroidVault final : public Vault {
  JNIEnv *env_;
  jobject object_;
  jclass cls_;
  void check() {
    if (env_->ExceptionCheck())
      throw std::runtime_error("Native Device vault failed");
  }

public:
  AndroidVault(JNIEnv *env, jobject object)
      : env_(env), object_(object), cls_(env->GetObjectClass(object)) {}
  ~AndroidVault() { env_->DeleteLocalRef(cls_); }
  Bytes load(const std::string &name) override {
    auto key = env_->NewStringUTF(name.c_str());
    auto method = env_->GetMethodID(cls_, "load", "(Ljava/lang/String;)[B");
    auto array =
        static_cast<jbyteArray>(env_->CallObjectMethod(object_, method, key));
    env_->DeleteLocalRef(key);
    check();
    if (!array)
      return {};
    Bytes value(env_->GetArrayLength(array));
    env_->GetByteArrayRegion(array, 0, value.size(),
                             reinterpret_cast<jbyte *>(value.data()));
    Bytes zeros(value.size());
    env_->SetByteArrayRegion(array, 0, zeros.size(),
                             reinterpret_cast<jbyte *>(zeros.data()));
    env_->DeleteLocalRef(array);
    return value;
  }
  void save(const std::string &name, const Bytes &value) override {
    auto key = env_->NewStringUTF(name.c_str());
    auto array = env_->NewByteArray(value.size());
    env_->SetByteArrayRegion(array, 0, value.size(),
                             reinterpret_cast<const jbyte *>(value.data()));
    auto method = env_->GetMethodID(cls_, "save", "(Ljava/lang/String;[B)V");
    env_->CallVoidMethod(object_, method, key, array);
    // JNI array writes are forbidden while a Java exception is pending.
    // Clear it only long enough to erase the secret transport buffer, then
    // restore the original vault failure for the caller.
    auto failure = env_->ExceptionOccurred();
    if (failure)
      env_->ExceptionClear();
    Bytes zeros(value.size());
    env_->SetByteArrayRegion(array, 0, zeros.size(),
                             reinterpret_cast<const jbyte *>(zeros.data()));
    env_->DeleteLocalRef(array);
    env_->DeleteLocalRef(key);
    if (failure) {
      env_->Throw(failure);
      env_->DeleteLocalRef(failure);
    }
    check();
  }
  void remove(const std::string &name) override {
    auto key = env_->NewStringUTF(name.c_str());
    auto method = env_->GetMethodID(cls_, "remove", "(Ljava/lang/String;)V");
    env_->CallVoidMethod(object_, method, key);
    env_->DeleteLocalRef(key);
    check();
  }
};
} // namespace
extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_executeNative(
    JNIEnv *env, jobject, jstring op, jstring input, jobject vault) {
  try {
    AndroidVault store(env, vault);
    return output(
        env,
        engine().execute(utf8(env, op), request(env, input), store).dump());
  } catch (...) {
    if (!env->ExceptionCheck())
      fail(env);
    return nullptr;
  }
}
extern "C" JNIEXPORT void JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_setAllowedNative(
    JNIEnv *, jobject, jboolean value) {
  engine().setAllowed(value);
}
extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_importCredentialNative(
    JNIEnv *env, jobject, jbyteArray array) {
  Bytes value(env->GetArrayLength(array));
  env->GetByteArrayRegion(array, 0, value.size(),
                          reinterpret_cast<jbyte *>(value.data()));
  try {
    auto result = engine().importCredential(value);
    wipe(value);
    return output(env, result.dump());
  } catch (...) {
    wipe(value);
    fail(env);
    return nullptr;
  }
}
extern "C" JNIEXPORT jbyteArray JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_credentialFileNative(
    JNIEnv *env, jobject, jstring input) {
  try {
    auto value = engine().credentialFile(request(env, input));
    auto result = env->NewByteArray(value.size());
    env->SetByteArrayRegion(result, 0, value.size(),
                            reinterpret_cast<const jbyte *>(value.data()));
    wipe(value);
    return result;
  } catch (...) {
    fail(env);
    return nullptr;
  }
}
extern "C" JNIEXPORT void JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_retainCredentialNative(
    JNIEnv *env, jobject, jstring input) {
  try {
    engine().retainCredential(request(env, input));
  } catch (...) {
    fail(env);
  }
}
extern "C" JNIEXPORT void JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_releaseCredentialNative(
    JNIEnv *env, jobject, jstring input) {
  try {
    engine().releaseCredential(request(env, input));
  } catch (...) {
    fail(env);
  }
}
extern "C" JNIEXPORT void JNICALL
Java_expo_modules_keycrypto_ExpoKeyCryptoModule_clearCredentialsNative(
    JNIEnv *, jobject) {
  engine().clearCredentials();
}
