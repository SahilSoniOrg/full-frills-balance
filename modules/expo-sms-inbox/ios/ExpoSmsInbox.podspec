Pod::Spec.new do |s|
  s.name           = 'ExpoSmsInbox'
  s.version        = '1.0.0'
  s.summary        = 'Device local SMS and Shortcut alert intake.'
  s.description    = 'Provides the local Shortcut SMS queue to the Full Frills Balance app.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Full Frills Balance'
  s.homepage       = 'https://expo.dev'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://example.invalid/expo-sms-inbox.git', :tag => s.version.to_s }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
