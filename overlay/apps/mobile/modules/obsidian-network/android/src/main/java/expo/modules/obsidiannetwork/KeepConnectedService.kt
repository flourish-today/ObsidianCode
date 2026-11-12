package expo.modules.obsidiannetwork

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

// Keeps the app process running for a while after the owner leaves it, so Android doesn't freeze
// it. Tailscale, the connection to the Mac and local agent notifications then keep working. The
// JavaScript side (keepConnected.ts) decides when it runs; Android requires the visible
// notification, which also shows the connection state.
class KeepConnectedService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stop(this)
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = buildNotification(this)
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      // Android refuses a start from the background; the app tries again when it's in front.
      Log.w(TAG, "Couldn't keep the connection running", error)
      running = false
      stopSelf()
    }
    // Not restarted without the app: the connection lives in the app's JavaScript.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  companion object {
    private const val TAG = "ObsidianKeepConnected"
    private const val CHANNEL = "obsidiancode-connection"
    private const val NOTIFICATION_ID = 7301
    private const val ACTION_STOP = "expo.modules.obsidiannetwork.KEEP_CONNECTED_STOP"
    // Upper bound on keeping the processor awake, in case the app never says to stop.
    private const val MAX_CPU_HOLD_MS = 3L * 60 * 60 * 1000
    // Time to finish handling the last update (such as posting a notification) after work ends.
    private const val CPU_GRACE_MS = 15_000L

    @Volatile private var running = false
    @Volatile private var title = "ObsidianCode"
    @Volatile private var text = ""
    private var wakeLock: PowerManager.WakeLock? = null

    private fun buildNotification(context: Context): Notification {
      val manager = requireNotNull(context.getSystemService(NotificationManager::class.java))
      if (Build.VERSION.SDK_INT >= 26) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL, "Connection status", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shows while ObsidianCode stays connected to your computer"
            setShowBadge(false)
          }
        )
      }
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, 1, it, PendingIntent.FLAG_IMMUTABLE)
      }
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL)
        else Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
      return builder
        .setSmallIcon(R.drawable.obsidiancode_notification)
        .setContentTitle(title)
        .setContentText(text)
        .setStyle(Notification.BigTextStyle().bigText(text))
        .setContentIntent(open)
        .setCategory(Notification.CATEGORY_SERVICE)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .build()
    }

    // Starts the service if needed, or updates its notification. stopAtMs (wall-clock time, 0 for
    // none) stops it later even though the app's JavaScript timers pause in the background.
    // Returns false if Android refused.
    @Synchronized
    fun update(
      context: Context, newTitle: String, newText: String, holdCpu: Boolean, stopAtMs: Long,
    ): Boolean {
      val app = context.applicationContext
      title = newTitle
      text = newText
      setHoldCpu(app, holdCpu)
      scheduleStop(app, stopAtMs)
      if (running) {
        try {
          app.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification(app))
        } catch (_: SecurityException) {
          // Without notification permission Android still keeps the service; it just isn't shown.
        }
        return true
      }
      return try {
        val intent = Intent(app, KeepConnectedService::class.java)
        if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
        running = true
        true
      } catch (error: Exception) {
        Log.w(TAG, "Couldn't start keeping the connection", error)
        false
      }
    }

    @Synchronized
    fun stop(context: Context) {
      val app = context.applicationContext
      setHoldCpu(app, false)
      scheduleStop(app, 0)
      if (!running) return
      running = false
      app.stopService(Intent(app, KeepConnectedService::class.java))
    }

    private fun stopIntent(context: Context): PendingIntent =
      PendingIntent.getService(
        context, 2,
        Intent(context, KeepConnectedService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    // An inexact alarm that doesn't wake the phone: if it's asleep, stopping can wait until it wakes.
    private fun scheduleStop(context: Context, stopAtMs: Long) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val intent = stopIntent(context)
      alarms.cancel(intent)
      if (stopAtMs > 0) alarms.set(AlarmManager.RTC, stopAtMs, intent)
    }

    private fun setHoldCpu(context: Context, hold: Boolean) {
      val lock = wakeLock ?: context.getSystemService(PowerManager::class.java)
        ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ObsidianCode:agent-working")
        ?.apply { setReferenceCounted(false) }
        ?.also { wakeLock = it }
        ?: return
      if (hold) {
        lock.acquire(MAX_CPU_HOLD_MS)
      } else if (lock.isHeld) {
        // A short hold instead of releasing now, so the last update is fully handled.
        lock.acquire(CPU_GRACE_MS)
      }
    }
  }
}
