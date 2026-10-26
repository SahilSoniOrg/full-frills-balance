package in.sahilsoni.fullfrillsbalance;
    
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
        detoxConfig.rnContextLoadTimeoutSec = (in.sahilsoni.fullfrillsbalance.BuildConfig.DEBUG ? 180 : 60);

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        boolean profile = "1".equals(InstrumentationRegistry.getArguments().getString("detoxFFBProfile"));
        BroadcastReceiver profiler = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ignored, Intent intent) {
                if ("in.sahilsoni.fullfrillsbalance.preview.PERF_START".equals(intent.getAction())) {
                    HermesSamplingProfiler.enable();
                } else if ("in.sahilsoni.fullfrillsbalance.preview.PERF_STOP".equals(intent.getAction())) {
                    HermesSamplingProfiler.disable();
                    File output = new File(context.getExternalFilesDir(null), "ffb-account.hermes.json");
                    HermesSamplingProfiler.dumpSampledTraceToFile(output.getAbsolutePath());
                    Log.i("FFB-PERF", "hermes_profile_saved");
                }
            }
        };
        if (profile) {
            IntentFilter filter = new IntentFilter();
            filter.addAction("in.sahilsoni.fullfrillsbalance.preview.PERF_START");
            filter.addAction("in.sahilsoni.fullfrillsbalance.preview.PERF_STOP");
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
