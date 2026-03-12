require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json'))) rescue {}

Pod::Spec.new do |s|
  s.name           = 'ExpoWidgets'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'Widget bridge helpers for Full Frills Balance'
  s.description    = 'Native hooks for syncing data and refreshing widgets.'
  s.license        = package['license'] || 'MIT'
  s.author         = package['author'] || 'OpenAI'
  s.homepage       = package['homepage'] || 'https://expo.dev'
  s.platforms      = { :ios => '16.1' }
  s.source         = { :git => 'https://example.invalid/expo-widgets.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
