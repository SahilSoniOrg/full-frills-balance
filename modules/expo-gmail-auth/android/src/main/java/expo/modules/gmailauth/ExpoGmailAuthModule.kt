package expo.modules.gmailauth

import android.accounts.Account
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Never starts an Activity or attempts interactive recovery from a background task. */
class ExpoGmailAuthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoGmailAuth")

    AsyncFunction("getBackgroundToken") { expectedAccountId: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val user = GoogleSignIn.getLastSignedInAccount(context)
        ?: throw IllegalStateException("Google sign-in is unavailable")
      val scope = "https://www.googleapis.com/auth/gmail.readonly"
      if (user.id != expectedAccountId || !user.grantedScopes.contains(Scope(scope))) {
        throw IllegalStateException("Gmail authorization needs attention")
      }
      val email = user.email ?: throw IllegalStateException("Google account is unavailable")
      val token = GoogleAuthUtil.getToken(context, Account(email, "com.google"), "oauth2:$scope")
      mapOf("accessToken" to token, "email" to email)
    }
  }
}
