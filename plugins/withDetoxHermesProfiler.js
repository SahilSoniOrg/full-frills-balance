const { withBaseMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');
const appVariants = require('../app-variants.json');

const MARKER = '// @generated begin detox-hermes-profiler - expo prebuild (DO NOT MODIFY)';

function detoxTestSource(packageName, profileApplicationId) {
  return `package ${packageName};

${MARKER}
import com.wix.detox.Detox;
import com.wix.detox.config.DetoxConfig;
import com.facebook.hermes.instrumentation.HermesSamplingProfiler;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Log;
import java.io.File;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.rule.ActivityTestRule;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class DetoxTest {
    @Rule
    public ActivityTestRule<MainActivity> mActivityRule = new ActivityTestRule<>(MainActivity.class, false, false);

    @Test
    public void runDetoxTests() {
        DetoxConfig detoxConfig = new DetoxConfig();
        detoxConfig.idlePolicyConfig.masterTimeoutSec = 90;
        detoxConfig.idlePolicyConfig.idleResourceTimeoutSec = 60;
        detoxConfig.rnContextLoadTimeoutSec = (${packageName}.BuildConfig.DEBUG ? 180 : 60);

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        boolean profile = "1".equals(InstrumentationRegistry.getArguments().getString("detoxFFBProfile"));
        BroadcastReceiver profiler = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ignored, Intent intent) {
                if ("${profileApplicationId}.PERF_START".equals(intent.getAction())) {
                    HermesSamplingProfiler.enable();
                } else if ("${profileApplicationId}.PERF_STOP".equals(intent.getAction())) {
                    HermesSamplingProfiler.disable();
                    File output = new File(context.getExternalFilesDir(null), "ffb-account.hermes.json");
                    HermesSamplingProfiler.dumpSampledTraceToFile(output.getAbsolutePath());
                    Log.i("FFB-PERF", "hermes_profile_saved");
                }
            }
        };
        if (profile) {
            IntentFilter filter = new IntentFilter();
            filter.addAction("${profileApplicationId}.PERF_START");
            filter.addAction("${profileApplicationId}.PERF_STOP");
            if (Build.VERSION.SDK_INT >= 33) {
                context.registerReceiver(profiler, filter, Context.RECEIVER_EXPORTED);
            } else {
                context.registerReceiver(profiler, filter);
            }
        }
        try {
            Detox.runTests(mActivityRule, detoxConfig);
        } finally {
            if (profile) context.unregisterReceiver(profiler);
        }
    }
}
`;
}

/**
 * Replaces the stock DetoxTest.java from expo-detox-config-plugin with our Hermes
 * sampling profiler hooks used by Android page-transition benchmarks.
 *
 * Must be listed after `expo-detox-config-plugin`. Uses withBaseMod so we call the
 * prior dangerous mods first (including Detox's stock write), then overwrite.
 */
module.exports = function withDetoxHermesProfiler(config) {
  return withBaseMod(config, {
    platform: 'android',
    mod: 'dangerous',
    async action({ modRequest: { nextMod, ...modRequest }, ...cfg }) {
      const result = await nextMod({
        ...cfg,
        modRequest,
      });
      const packageName = AndroidConfig.Package.getPackage(result) ?? result.android?.package;
      if (!packageName) {
        throw new Error('withDetoxHermesProfiler: android package is required');
      }
      const profileApplicationId = appVariants.preview.androidApplicationId;
      const folder = path.join(
        result.modRequest.platformProjectRoot,
        'app/src/androidTest/java',
        ...packageName.split('.'),
      );
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(
        path.join(folder, 'DetoxTest.java'),
        detoxTestSource(packageName, profileApplicationId),
        'utf8',
      );
      return result;
    },
  });
};
