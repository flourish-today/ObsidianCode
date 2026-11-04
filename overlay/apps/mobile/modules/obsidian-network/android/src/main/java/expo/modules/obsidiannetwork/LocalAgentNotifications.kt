package expo.modules.obsidiannetwork

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

// Android notifications only: no push tokens, services, network or extra dependencies.
object LocalAgentNotifications {
  private const val CHANNEL = "obsidiancode-agent-alerts"

  private fun manager(context: Context): NotificationManager {
    val manager = requireNotNull(context.getSystemService(NotificationManager::class.java))
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Agent alerts", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Agent completions, failures and requests for your response"
          lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
      )
    }
    return manager
  }

  fun enabled(context: Context): Boolean {
    val manager = manager(context)
    return manager.areNotificationsEnabled() && (Build.VERSION.SDK_INT < 26 ||
      (manager.getNotificationChannel(CHANNEL)?.importance ?: NotificationManager.IMPORTANCE_NONE)
        != NotificationManager.IMPORTANCE_NONE)
  }

  fun show(context: Context, path: String, scheme: String, title: String, body: String): Boolean {
    if (!enabled(context)) return false
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
    intent.action = Intent.ACTION_VIEW
    intent.data = Uri.parse("$scheme:/$path")
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val openThread = PendingIntent.getActivity(
      context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)
        .setDefaults(Notification.DEFAULT_SOUND)
    val notification = builder
      .setSmallIcon(R.drawable.obsidiancode_notification)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(openThread)
      .setCategory(Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .build()
    return try {
      // One alert per thread; an answer request replaces an older completion.
      manager(context).notify(path, 0, notification)
      true
    } catch (_: SecurityException) {
      // Permission can be revoked between the check and the notification.
      false
    }
  }

  fun dismiss(context: Context, path: String) {
    manager(context).cancel(path, 0)
  }
}
