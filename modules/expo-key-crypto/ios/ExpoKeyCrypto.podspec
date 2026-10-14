require 'shellwords'
require 'json'
require 'digest'
module_root = File.expand_path('..', __dir__)
project_root = File.expand_path('../..', module_root)
prepare = File.join(project_root, 'scripts/prepare-native-key-crypto.mjs')
system('node', prepare) || raise('Pinned native JSON dependency is unavailable')
openssl = File.join(project_root, 'node_modules/react-native-quick-crypto/ios/openssl')
provider_package = File.join(project_root, 'node_modules/react-native-quick-crypto/package.json')
prefix = File.join(openssl, 'quickcrypto_openssl_prefix.h')
unless JSON.parse(File.read(provider_package))['version'] == '1.1.7' &&
       File.file?(File.join(openssl, 'include/openssl/hpke.h')) &&
       File.file?(prefix) &&
       Digest::SHA256.file(prefix).hexdigest == '27348efb4d454be86c81e7662cdbcaf53a3d05389d0f96b9672f004c8786fb73'
  raise('ExpoKeyCrypto requires the reviewed QuickCrypto 1.1.7 OpenSSL headers/symbol prefix; review the provider binding before upgrading')
end
Pod::Spec.new do |s|
  s.name = 'ExpoKeyCrypto'
  s.version = '1.0.0'
  s.summary = 'Native private-key operations for Full Frills Balance'
  s.description = 'Device vault access, HPKE, User signing and snapshot encryption without exporting raw keys to JavaScript.'
  s.license = 'MIT'
  s.author = 'Full Frills Balance'
  s.homepage = 'https://github.com/SahilSoniOrg/full-frills-balance'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/SahilSoniOrg/full-frills-balance.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'QuickCrypto', '1.1.7'
  s.source_files = '*.{h,mm,swift}'
  s.public_header_files = 'FFBKeyCrypto.h'
  s.frameworks = 'Security'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => "$(inherited) \"#{module_root}/vendor\" \"#{module_root}/cpp\" \"#{openssl}/include\"",
    'OTHER_CPLUSPLUSFLAGS' => "$(inherited) -include \"#{openssl}/quickcrypto_openssl_prefix.h\" -fstack-protector-strong"
  }
end
