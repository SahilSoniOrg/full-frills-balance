package expo.modules.smsinbox

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AutomaticSmsImportTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig = HeadlessJsTaskConfig(
    "AutomaticSmsImport",
    Arguments.createMap().apply { putBoolean("retryWhenEmpty", true) },
    120_000L,
    true
  )
}
