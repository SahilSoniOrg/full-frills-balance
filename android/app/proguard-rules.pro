# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# @generated begin expo-build-properties - expo prebuild (DO NOT MODIFY)
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep,allowobfuscation,allowshrinking class com.facebook.react.** { *; }
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class expo.modules.** { *; }
-keepclassmembers class * { @expo.modules.core.interfaces.ExpoMethod *; }
-keep class io.sentry.** { *; }
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keep class com.nozbe.watermelondb.** { *; }
-keep class com.nozbe.watermelondb.jsi.** { *; }
# @generated end expo-build-properties