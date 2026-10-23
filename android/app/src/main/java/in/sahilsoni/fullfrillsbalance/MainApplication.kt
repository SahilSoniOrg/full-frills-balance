package `in`.sahilsoni.fullfrillsbalance
import com.facebook.react.common.assets.ReactFontManager

import android.app.Application
import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage;        

import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
              add(WatermelonDBJSIPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    // @generated begin xml-fonts-init - expo prebuild (DO NOT MODIFY) sync-287ef5c81ee3b97d6c23f7574bfd03c26271bd78
    ReactFontManager.getInstance().addCustomFont(this, "DMSerifDisplay-Regular", R.font.xml_dm_serif_display_regular)
    ReactFontManager.getInstance().addCustomFont(this, "InstrumentSans-Regular", R.font.xml_instrument_sans_regular)
    ReactFontManager.getInstance().addCustomFont(this, "InstrumentSans-Medium", R.font.xml_instrument_sans_medium)
    ReactFontManager.getInstance().addCustomFont(this, "InstrumentSans-SemiBold", R.font.xml_instrument_sans_semi_bold)
    ReactFontManager.getInstance().addCustomFont(this, "InstrumentSans-Bold", R.font.xml_instrument_sans_bold)
    ReactFontManager.getInstance().addCustomFont(this, "Raleway-Regular", R.font.xml_raleway_regular)
    ReactFontManager.getInstance().addCustomFont(this, "Raleway-Medium", R.font.xml_raleway_medium)
    ReactFontManager.getInstance().addCustomFont(this, "Raleway-SemiBold", R.font.xml_raleway_semi_bold)
    ReactFontManager.getInstance().addCustomFont(this, "Raleway-Bold", R.font.xml_raleway_bold)
    ReactFontManager.getInstance().addCustomFont(this, "Inter-Regular", R.font.xml_inter_regular)
    ReactFontManager.getInstance().addCustomFont(this, "Inter-Medium", R.font.xml_inter_medium)
    ReactFontManager.getInstance().addCustomFont(this, "Inter-SemiBold", R.font.xml_inter_semi_bold)
    ReactFontManager.getInstance().addCustomFont(this, "Inter-Bold", R.font.xml_inter_bold)
    ReactFontManager.getInstance().addCustomFont(this, "CrimsonText-Regular", R.font.xml_crimson_text_regular)
    // @generated end xml-fonts-init
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
